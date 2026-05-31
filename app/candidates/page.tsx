import { CandidateReviewClient } from "@/components/CandidateReviewClient";
import { StatCard } from "@/components/StatCard";
import { getCandidateReadiness } from "@/lib/candidatePromotion";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function CandidatesPage() {
  const repository = getAutomationRepository();
  const [candidates, queueItems, productionHistory] = await Promise.all([
    repository.getProductCandidates(),
    repository.getQueue(),
    repository.getProductionHistory()
  ]);
  const readiness = Object.fromEntries(
    candidates.map((candidate) => [
      candidate.id,
      getCandidateReadiness(candidate, queueItems, productionHistory)
    ])
  );
  const readyCount = Object.values(readiness).filter((item) => item.can_promote).length;
  const missingAffiliateCount = Object.values(readiness).filter((item) => item.status === "missing_affiliate").length;
  const duplicateCount = Object.values(readiness).filter((item) => item.status === "duplicate").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">후보 검수</h1>
        <p className="mt-2 text-sm text-slate-500">
          수집된 product_candidates를 검토하고, 조건을 통과한 후보만 상품 제작 큐로 승격합니다.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="전체 후보" value={candidates.length} />
        <StatCard label="승격 가능" value={readyCount} tone={readyCount > 0 ? "success" : "default"} />
        <StatCard label="제휴 링크 누락" value={missingAffiliateCount} tone={missingAffiliateCount > 0 ? "warning" : "default"} />
        <StatCard label="중복 의심" value={duplicateCount} tone={duplicateCount > 0 ? "warning" : "default"} />
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        제휴 링크 없는 후보는 승격할 수 없습니다. 승격 직후 worker job은 만들지 않으며, 다음 배치 실행 시 조건을 통과한 항목만 생성됩니다.
      </section>

      <CandidateReviewClient candidates={candidates} readiness={readiness} />
    </div>
  );
}
