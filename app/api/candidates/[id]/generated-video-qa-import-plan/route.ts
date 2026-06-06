import { NextResponse } from "next/server";
import {
  buildGeneratedVideoQaImportPlan,
  generatedVideoQaImportPlanSideEffects,
  validateGeneratedVideoManifest
} from "@/lib/video-qa-import";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

async function readOptionalJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function parseManifestBody(body: Record<string, unknown>) {
  if (typeof body.manifest_text === "string") {
    return JSON.parse(body.manifest_text) as unknown;
  }
  return body.generated_video_manifest ?? body.import_manifest ?? undefined;
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
        side_effects: { ...generatedVideoQaImportPlanSideEffects },
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
        message: "Generated video manifest request JSON could not be parsed.",
        side_effects: { ...generatedVideoQaImportPlanSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  let rawManifest: unknown;
  try {
    rawManifest = parseManifestBody(body);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_VIDEO_MANIFEST_JSON",
        message: "Generated video manifest JSON could not be parsed.",
        side_effects: { ...generatedVideoQaImportPlanSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const validation = rawManifest === undefined ? null : validateGeneratedVideoManifest(rawManifest);
  if (validation && !validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_VIDEO_MANIFEST",
        message: "Generated video manifest is invalid.",
        errors: validation.errors,
        warnings: validation.warnings,
        side_effects: { ...generatedVideoQaImportPlanSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const generatedVideoQaImportPlan = buildGeneratedVideoQaImportPlan(candidate, validation?.manifest ?? null);

  return NextResponse.json({
    ok: true,
    candidate_id: candidate.id,
    generated_video_qa_import_plan: generatedVideoQaImportPlan,
    side_effects: { ...generatedVideoQaImportPlanSideEffects },
    approval_required: true,
    warnings: validation?.warnings ?? []
  });
}
