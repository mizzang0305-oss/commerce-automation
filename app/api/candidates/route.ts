import { NextResponse } from "next/server";
import { getCandidateReadiness } from "@/lib/candidatePromotion";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { CandidateDuplicateStatus, CandidatePromotionStatus } from "@/types/automation";

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
      duplicate_status: parseDuplicateStatus(url.searchParams.get("duplicate_status")),
      promotion_status: parsePromotionStatus(url.searchParams.get("promotion_status")),
      min_score: toPositiveNumber(url.searchParams.get("min_score")),
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

function parseDuplicateStatus(value: string | null): CandidateDuplicateStatus | "all" | undefined {
  if (
    value === "all" ||
    value === "unique" ||
    value === "duplicate_candidate" ||
    value === "already_queued" ||
    value === "already_produced" ||
    value === "unknown"
  ) {
    return value;
  }
  return undefined;
}

function parsePromotionStatus(value: string | null): CandidatePromotionStatus | "all" | undefined {
  if (
    value === "all" ||
    value === "ready" ||
    value === "blocked_missing_affiliate" ||
    value === "blocked_missing_name" ||
    value === "blocked_duplicate" ||
    value === "needs_review" ||
    value === "promoted"
  ) {
    return value;
  }
  return undefined;
}

function toPositiveNumber(value: string | null) {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
