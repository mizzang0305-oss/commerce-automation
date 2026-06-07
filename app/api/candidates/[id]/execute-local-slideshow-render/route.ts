import { NextResponse } from "next/server";
import {
  localSlideshowExecutionConfirmationPhrase,
  localSlideshowExecutionSafeBlockedSideEffects
} from "@/lib/local-slideshow-execution";
import {
  asEnginePreference,
  asInputImagePaths,
  asLocalSlideshowRenderPackage
} from "@/lib/local-slideshow-execution/validateExecutionRequest";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

async function readOptionalJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const repository = getAutomationRepository();
  const candidate = await repository.getProductCandidate(id);

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CANDIDATE_NOT_FOUND",
        message: "Candidate product was not found.",
        side_effects: { ...localSlideshowExecutionSafeBlockedSideEffects },
        approval_required: true
      },
      { status: 404 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await readOptionalJson(request);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_JSON",
        message: "Local slideshow render execution request JSON could not be parsed.",
        side_effects: { ...localSlideshowExecutionSafeBlockedSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  if (confirmation !== localSlideshowExecutionConfirmationPhrase) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CONFIRMATION_REQUIRED",
        message: "Exact approval is required before executing local slideshow rendering.",
        confirmation_required: localSlideshowExecutionConfirmationPhrase,
        side_effects: { ...localSlideshowExecutionSafeBlockedSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const renderPackage = asLocalSlideshowRenderPackage(body.render_package);
  if (!renderPackage) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "RENDER_PACKAGE_REQUIRED",
        message: "A local slideshow render package is required before execution.",
        side_effects: { ...localSlideshowExecutionSafeBlockedSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const { runLocalSlideshowExecution } = await import("@/lib/local-slideshow-execution/runLocalSlideshowExecution");
  const result = await runLocalSlideshowExecution({
    candidateId: candidate.id,
    renderPackage,
    enginePreference: asEnginePreference(body.engine_preference),
    inputImagePaths: asInputImagePaths(body.input_image_paths)
  });

  return NextResponse.json(
    {
      ok: result.execution_succeeded,
      candidate_id: candidate.id,
      result,
      side_effects: result.side_effects,
      approval_required: true
    },
    { status: result.execution_succeeded ? 200 : 424 }
  );
}
