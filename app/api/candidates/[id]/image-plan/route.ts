import { NextResponse } from "next/server";
import { buildCommerceImagePromptPlan, commerceImagePlanSideEffects } from "@/lib/image-prompts/prompt-builder";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
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
        message: "후보 상품을 찾을 수 없습니다.",
        side_effects: { ...commerceImagePlanSideEffects }
      },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ok: true,
    plan: buildCommerceImagePromptPlan(candidate)
  });
}
