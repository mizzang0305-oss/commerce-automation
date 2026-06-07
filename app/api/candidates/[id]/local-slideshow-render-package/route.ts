import { NextResponse } from "next/server";
import {
  buildLocalSlideshowRenderPackage,
  localSlideshowRenderConfirmationPhrase,
  localSlideshowRenderSideEffects
} from "@/lib/local-slideshow-render";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { SlideshowPackagePlan } from "@/lib/slideshow-package";

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

function asSlideshowPackagePlan(value: unknown): SlideshowPackagePlan | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.mode !== "selected_image_slideshow_package_plan") {
    return null;
  }
  if (!isRecord(value.ffmpeg_preview) || !isRecord(value.moviepy_preview)) {
    return null;
  }
  return value as unknown as SlideshowPackagePlan;
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
        side_effects: { ...localSlideshowRenderSideEffects },
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
        message: "Local slideshow render package request JSON could not be parsed.",
        side_effects: { ...localSlideshowRenderSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const confirmation = typeof body.confirmation === "string" ? body.confirmation : "";
  const slideshowPackagePlan = asSlideshowPackagePlan(body.slideshow_package_plan);

  if (!slideshowPackagePlan) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "SLIDESHOW_PACKAGE_PLAN_REQUIRED",
        message: "A slideshow package plan is required before preparing local render package text.",
        side_effects: { ...localSlideshowRenderSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  if (confirmation !== localSlideshowRenderConfirmationPhrase) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CONFIRMATION_REQUIRED",
        message: "Exact confirmation is required before preparing local render package text.",
        confirmation_required: localSlideshowRenderConfirmationPhrase,
        side_effects: { ...localSlideshowRenderSideEffects },
        approval_required: true
      },
      { status: 400 }
    );
  }

  const localSlideshowRenderPackage = buildLocalSlideshowRenderPackage(candidate, slideshowPackagePlan, {
    confirmation
  });

  return NextResponse.json({
    ok: true,
    candidate_id: candidate.id,
    local_slideshow_render_package: localSlideshowRenderPackage,
    side_effects: { ...localSlideshowRenderSideEffects },
    approval_required: true
  });
}
