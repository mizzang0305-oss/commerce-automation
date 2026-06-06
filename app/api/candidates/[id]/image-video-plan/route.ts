import { NextResponse } from "next/server";
import { buildCommerceImagePromptPlan } from "@/lib/image-prompts/prompt-builder";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { buildCommerceImageVideoPlan, commerceVideoPlanSideEffects } from "@/lib/video-plans/buildCommerceVideoPlan";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const candidate = await getAutomationRepository().getProductCandidate(id);

  if (!candidate) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "CANDIDATE_NOT_FOUND",
        message: "Candidate was not found.",
        side_effects: { ...commerceVideoPlanSideEffects },
        approval_required: true
      },
      { status: 404 }
    );
  }

  const imagePlan = buildCommerceImagePromptPlan(candidate);
  const combinedPlan = buildCommerceImageVideoPlan(imagePlan);

  return NextResponse.json({
    ok: true,
    candidate_id: candidate.id,
    image_asset_plans: combinedPlan.image_asset_plans,
    image_plan: combinedPlan.image_plan,
    video_plan: combinedPlan.video_plan,
    side_effects: combinedPlan.side_effects,
    approval_required: combinedPlan.approval_required
  });
}
