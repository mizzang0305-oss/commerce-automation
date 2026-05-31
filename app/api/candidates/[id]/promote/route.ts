import { NextResponse } from "next/server";
import { CandidatePromotionError } from "@/lib/candidatePromotion";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const scheduledAt = typeof body.scheduled_at === "string" ? body.scheduled_at : undefined;

  try {
    const result = await getAutomationRepository().promoteCandidateToQueue(id, {
      scheduled_at: scheduledAt
    });
    return NextResponse.json({
      ok: true,
      ...result
    });
  } catch (error) {
    if (error instanceof CandidatePromotionError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { ok: false, message: "후보 승격 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
