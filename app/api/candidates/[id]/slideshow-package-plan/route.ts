import { NextResponse } from "next/server";
import { buildSlideshowPackagePlan, slideshowPackagePlanSideEffects } from "@/lib/slideshow-package";
import type { SelectedImageAssetPlan } from "@/lib/image-qa-import/types";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

async function readOptionalJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asSelectedImageAssetPlan(value: unknown): SelectedImageAssetPlan | null {
  if (!isRecord(value)) {
    return null;
  }
  if (!Array.isArray(value.selected_assets)) {
    return null;
  }
  return value as unknown as SelectedImageAssetPlan;
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
        side_effects: { ...slideshowPackagePlanSideEffects },
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
        message: "Slideshow package plan request JSON could not be parsed.",
        side_effects: { ...slideshowPackagePlanSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const selectedImageAssetPlan = asSelectedImageAssetPlan(body.selected_image_asset_plan);
  const slideshowPackagePlan = buildSlideshowPackagePlan(candidate, selectedImageAssetPlan);

  return NextResponse.json({
    ok: true,
    candidate_id: candidate.id,
    slideshow_package_plan: slideshowPackagePlan,
    side_effects: { ...slideshowPackagePlanSideEffects },
    approval_required: true
  });
}
