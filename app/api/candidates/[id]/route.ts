import { NextResponse } from "next/server";
import { getCandidateReadiness } from "@/lib/candidatePromotion";
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
    return NextResponse.json({ ok: false, message: "후보를 찾을 수 없습니다." }, { status: 404 });
  }

  const [queueItems, productionHistory] = await Promise.all([
    repository.getQueue(),
    repository.getProductionHistory()
  ]);

  return NextResponse.json({
    candidate,
    readiness: getCandidateReadiness(candidate, queueItems, productionHistory)
  });
}
