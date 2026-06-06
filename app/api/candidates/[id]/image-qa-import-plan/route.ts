import { NextResponse } from "next/server";
import {
  buildImageQaImportPlan,
  imageQaImportSideEffects
} from "@/lib/image-qa-import/buildImageQaImportPlan";
import { buildLocalImageGenerationPackage } from "@/lib/image-generation-bridge/buildLocalImageGenerationPackage";
import { validateImageImportManifest } from "@/lib/image-qa-import/validateImageImportManifest";
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
        side_effects: { ...imageQaImportSideEffects },
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
        message: "Import manifest JSON could not be parsed.",
        side_effects: { ...imageQaImportSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const rawManifest = body.import_manifest;
  const validation = rawManifest === undefined ? null : validateImageImportManifest(rawManifest);
  if (validation && !validation.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_IMPORT_MANIFEST",
        message: "Import manifest is invalid.",
        errors: validation.errors,
        warnings: validation.warnings,
        side_effects: { ...imageQaImportSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const localPackage = buildLocalImageGenerationPackage(candidate);
  const imageQaImportPlan = buildImageQaImportPlan(candidate, localPackage, validation?.manifest ?? undefined);

  return NextResponse.json({
    ok: true,
    candidate_id: candidate.id,
    image_qa_import_plan: imageQaImportPlan,
    side_effects: { ...imageQaImportSideEffects },
    approval_required: true,
    warnings: validation?.warnings ?? []
  });
}
