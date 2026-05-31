import { NextResponse } from "next/server";
import { getCandidateReadiness } from "@/lib/candidatePromotion";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repository = getAutomationRepository();
  const [candidates, queueItems, productionHistory] = await Promise.all([
    repository.getProductCandidates({
      query: url.searchParams.get("query") || undefined,
      has_affiliate_url: (url.searchParams.get("has_affiliate_url") as "all" | "yes" | "no" | null) || undefined,
      source: url.searchParams.get("source") || undefined,
      category: url.searchParams.get("category") || undefined,
      limit: toPositiveNumber(url.searchParams.get("limit"))
    }),
    repository.getQueue(),
    repository.getProductionHistory()
  ]);

  return NextResponse.json({
    candidates,
    readiness: Object.fromEntries(
      candidates.map((candidate) => [
        candidate.id,
        getCandidateReadiness(candidate, queueItems, productionHistory)
      ])
    )
  });
}

function toPositiveNumber(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
