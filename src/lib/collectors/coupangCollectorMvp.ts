import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductCandidate } from "@/types/automation";

export type CoupangCollectorMode = "dry_run";

export type CollectCoupangInput = {
  mode?: string;
  keywords?: unknown;
  limit_per_keyword?: unknown;
};

const SAMPLE_CATEGORIES = ["차량/정리", "주방/생활", "계절/선물", "수납/정돈"];

export async function collectCoupangCandidates(repository: AutomationRepository, input: CollectCoupangInput) {
  const mode: CoupangCollectorMode = "dry_run";
  const keywords = normalizeKeywords(input.keywords);
  const limitPerKeyword = normalizeLimit(input.limit_per_keyword);
  const [initialQueue, initialJobs, existingCandidates, queueItems, productionHistory] = await Promise.all([
    repository.getQueue(),
    repository.getWorkerJobs(),
    repository.getProductCandidates(),
    repository.getQueue(),
    repository.getProductionHistory()
  ]);
  const existingIds = new Set(existingCandidates.map((candidate) => candidate.id));
  const candidates = new Map<string, ProductCandidate>();

  for (const keyword of keywords) {
    for (let index = 1; index <= limitPerKeyword; index += 1) {
      const seed = stableSeed(keyword, index);
      const { candidate } = buildCoupangCandidate(
        {
          product_name: `${keyword} 테스트 후보 ${index}`,
          raw_coupang_url: `https://www.coupang.com/vp/products/${seed}?itemId=${seed}${index}&vendorItemId=${seed}${index}9&utm_source=collector`,
          selected_affiliate_url: `https://link.coupang.com/a/${seed}${index}`,
          thumbnail_url: `https://picsum.photos/seed/coupang-${seed}-${index}/1080/1920`,
          price_now_text: `${(9900 + index * 1200).toLocaleString("ko-KR")}원`,
          category_path: SAMPLE_CATEGORIES[(index - 1) % SAMPLE_CATEGORIES.length],
          source_type: "collector_dry_run",
          source: "coupang_collector_mvp"
        },
        {
          candidates: [...existingCandidates, ...candidates.values()],
          queueItems,
          productionHistory
        }
      );
      candidates.set(candidate.id, {
        ...candidate,
        payload: {
          ...candidate.payload,
          collector_mode: mode,
          source_keyword: keyword,
          risk_flags: []
        }
      });
    }
  }

  const saved = await repository.upsertProductCandidates([...candidates.values()]);
  const [finalQueue, finalJobs] = await Promise.all([repository.getQueue(), repository.getWorkerJobs()]);
  const duplicateCount = saved.filter((candidate) => existingIds.has(candidate.id)).length;

  return {
    ok: true,
    mode,
    created_count: Math.max(0, saved.length - duplicateCount),
    duplicate_count: duplicateCount,
    rejected_count: 0,
    queue_created: finalQueue.length > initialQueue.length,
    worker_jobs_created: finalJobs.length > initialJobs.length,
    items: saved.map(toSafeCollectorItem)
  };
}

function toSafeCollectorItem(candidate: ProductCandidate) {
  return {
    id: candidate.id,
    source_platform: "coupang",
    source_keyword: typeof candidate.payload.source_keyword === "string" ? candidate.payload.source_keyword : "",
    product_name: candidate.product_name,
    product_score: candidate.candidate_score ?? 0,
    candidate_status: candidate.promotion_status === "promoted" ? "promoted" : "collected",
    duplicate_status: candidate.duplicate_status ?? "unknown",
    risk_flags: Array.isArray(candidate.payload.risk_flags)
      ? candidate.payload.risk_flags.filter((flag): flag is string => typeof flag === "string")
      : []
  };
}

function normalizeKeywords(value: unknown) {
  const keywords = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
  return keywords.length > 0 ? keywords.slice(0, 10) : ["차량 정리함", "여름 주방용품", "생활 선물"];
}

function normalizeLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 3;
  }
  return Math.max(1, Math.min(10, Math.floor(numeric)));
}

function stableSeed(keyword: string, index: number) {
  let hash = 0;
  for (const char of `${keyword}:${index}`) {
    hash = (hash * 31 + char.charCodeAt(0)) % 1000000000;
  }
  return String(100000000 + hash).slice(0, 9);
}
