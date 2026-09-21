import { describe, expect, test } from "vitest";
import { selectV3Registry, validateUsageEvidenceRegistry } from "@/lib/usage-evidence";
import { buildSafeLiveCandidateSnapshot, classifyProviderFailure, summarizeProviderCalls } from "@/lib/usage-evidence/liveCapacityProof";
import { makeRankedProducts, makeUsageEvidenceRegistry, withV3MotionPack } from "../usage-evidence/fixture";

describe("V3 configured live marginal contract", () => {
  test("selected registry keeps only selected V3 packs and their referenced assets", () => {
    const baseline = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
    const one = withV3MotionPack(baseline, "desk_organization", 91);
    const candidate = validateUsageEvidenceRegistry(withV3MotionPack(one, "cable_organization", 92));
    const selectedId = "desk_organization-v3-test-pack-91";
    const selected = selectV3Registry(candidate, [selectedId]);
    expect(selected.packs.filter((pack) => pack.packGeneration === "v3_motion").map((pack) => pack.packId)).toEqual([selectedId]);
    const referenced = new Set(selected.packs.flatMap((pack) => pack.assetIds));
    expect(selected.assets.every((asset) => referenced.has(asset.assetId))).toBe(true);
  });

  test("accounts search/deeplink calls and classifies terminal auth failures", () => {
    const result = { ok: false, configured: true, blocker: "COUPANG_PARTNERS_SEARCH_HTTP_401", products: [], apiCallCount: 1, searchApiCalled: true, deeplinkApiCalled: false, credentialsExposed: false as const, authorizationHeadersExposed: false as const };
    expect(summarizeProviderCalls([result])).toEqual({ search: 1, deeplink: 0, total: 1 });
    expect(classifyProviderFailure([result])).toBe("LIVE_PROVIDER_AUTH_REJECTED");
  });

  test("counts unique products by both product key and canonical name", () => {
    const ranked = makeRankedProducts(2);
    ranked[1] = structuredClone(ranked[1]);
    ranked[1].candidate.canonicalProductName = ranked[0].candidate.canonicalProductName;
    const snapshot = buildSafeLiveCandidateSnapshot({ raw: ranked.map((entry) => entry.candidate), normalized: ranked.map((entry) => entry.candidate), ranked });
    expect(snapshot.counters.unique).toBe(1);
  });
});
