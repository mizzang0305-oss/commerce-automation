import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyOperationalCandidate,
  LocalQueueRepository,
  operationalStateHash,
  buildOperationalReserveCoverage,
  createOperationalAdmissionState,
  evaluateOperationalCandidate,
  isOperationalReserveCandidate,
  operationalAdmissionPolicy,
  operationalCandidateCoverageSlots,
  operationalCandidateCoverageDecisions,
  prepareOperationalAdmissionEvaluator,
  type LocalQueueItem,
  type QueueSchedulerSettings,
  type ReserveCandidate,
} from "../../src/lib/queue-scheduler";
import { DAILY_69_NO_UPLOAD_SETTINGS } from "../../src/lib/queue-scheduler/settings";

const settings: QueueSchedulerSettings = {
  ...DAILY_69_NO_UPLOAD_SETTINGS,
  dailyTargetCount: 9,
  pilotMaxDailyItems: 9,
  processingDailyCap: 9,
  maxCategoryRatio: 1 / 3,
  maxProductFamilyRatio: 1 / 9,
};

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("canonical operational admission", () => {
  it.each([false, true].flatMap((sameSlot) => ["active", "blocked", "missing", "older-unknown"].map((historyKind) => ({ sameSlot, historyKind }))))("preserves full state and event hashes after persisted replacements: $sameSlot / $historyKind", async ({ sameSlot, historyKind }) => {
    const root = await mkdtemp(join(tmpdir(), "admission-transition-")); roots.push(root);
    const repository = new LocalQueueRepository(root);
    const items = [item(1), item(2)];
    for (const row of items) { row.attemptCount = 1; row.productCandidateAttempt = 1; row.maxProductCandidates = 15; }
    if (historyKind === "blocked") for (const row of items) row.candidateHistory[0].outcome = "blocked";
    if (historyKind === "missing") for (const row of items) row.candidateHistory = [];
    if (historyKind === "older-unknown") for (const row of items) row.candidateHistory.unshift({ ...row.candidateHistory[0], productKey: `unknown-before-${row.id}`, outcome: "replaced" });
    // Legacy rows intentionally lack candidateId in history. Their currently
    // bound ID must survive the first replacement, without guessing older IDs.
    const reserve = [candidate(100), candidate(101), candidate(102)];
    await writeFile(repository.queuePath, JSON.stringify(items));
    await writeFile(repository.reservePath, JSON.stringify(reserve));
    await repository.writeSettings(settings);
    const policy = operationalAdmissionPolicy(settings, 15);
    let modeled = createOperationalAdmissionState(await repository.items(), await repository.reserveCandidates());
    for (let step = 0; step < 3; step += 1) {
      const rows = await repository.items();
      const target = rows[sameSlot ? 0 : step % 2];
      const available = (await repository.reserveCandidates()).filter((entry) => !entry.claimedBySlot);
      const expected = available[0];
      const decision = evaluateOperationalCandidate({ state: modeled, candidate: expected, policy, replacementContext: { slotId: target.slotId, failureStage: "CREATIVE_SELECTION_FAILED" } });
      expect(decision.eligible).toBe(true);
      const before = structuredClone(modeled);
      const replacement = await repository.replaceWithReserve({ id: target.id, reason: "CREATIVE_SELECTION_FAILED", now: new Date(`2026-09-10T01:0${step}:00Z`) });
      expect(replacement?.productKey).toBe(expected.candidate.productKey);
      const events = JSON.parse(await readFile(join(root, "operational-admission-events.json"), "utf8"));
      expect(events.at(-1).capLedgerHash).toBe(decision.prefixStateHash);
      modeled = applyOperationalCandidate(modeled, expected, decision);
      expect(before).not.toEqual(modeled);
      const reconstructed = createOperationalAdmissionState(await new LocalQueueRepository(root).items(), await new LocalQueueRepository(root).reserveCandidates());
      expect(modeled).toEqual(reconstructed);
      for (const slot of rows) expect(operationalStateHash(modeled, slot.slotId)).toBe(operationalStateHash(reconstructed, slot.slotId));
      expect(reconstructed.usedCandidateIds).toContain(target.candidate.candidateId);
      const idReuse = candidate(900 + step, { candidateId: target.candidate.candidateId });
      expect(evaluateOperationalCandidate({ state: reconstructed, candidate: idReuse, policy, replacementContext: { slotId: target.slotId } }).reasons).toContain("CANDIDATE_ALREADY_USED");
    }
    expect(new Set(modeled.consumedReserveIds).size).toBe(3);
    if (historyKind === "older-unknown") {
      for (const row of modeled.assignments) {
        expect(row.candidateHistory[0].candidateId).toBeUndefined();
        expect(modeled.usedProductIds).toContain(`unknown-before-${row.id}`);
      }
    }
  });

  it.each([
    "AFFILIATE_MISSING", "ALLOCATION_MISSING", "PRODUCT_MISMATCH", "BUSINESS_INELIGIBLE", "CANDIDATE_ALREADY_USED",
    "CATEGORY_CAP_REACHED", "FAMILY_CAP_REACHED", "SOURCE_CAP_REACHED", "ASSET_CAP_REACHED", "SEQUENCE_FINGERPRINT_ALREADY_USED", "NOT_MATERIALIZABLE",
  ])("keeps full decisions and zero coverage in parity for %s", (invalidClass) => {
    const fixture = base();
    const reserve = fixture.candidate;
    const policy = operationalAdmissionPolicy(settings, 1, ["blocked-video"]);
    if (invalidClass === "AFFILIATE_MISSING") reserve.candidate.selectedAffiliateUrl = "";
    if (invalidClass === "ALLOCATION_MISSING") reserve.usageEvidenceAllocation = undefined;
    if (invalidClass === "PRODUCT_MISMATCH") reserve.usageEvidenceAllocation!.productKey = "wrong-product";
    if (invalidClass === "BUSINESS_INELIGIBLE") reserve.score.eligible = false;
    if (invalidClass === "CANDIDATE_ALREADY_USED") fixture.items.push(item(1000, { productKey: reserve.candidate.productKey }));
    if (invalidClass === "CATEGORY_CAP_REACHED") fixture.items.push(...[1000, 1001, 1002].map((id) => item(id, { category: reserve.candidate.category })));
    if (invalidClass === "FAMILY_CAP_REACHED") fixture.items.push(item(1000, { category: reserve.candidate.category, name: reserve.candidate.canonicalProductName }));
    if (invalidClass === "SOURCE_CAP_REACHED") { reserve.usageEvidenceAllocation!.sourceIds = ["blocked-video"]; fixture.items.push(item(1000, { sourceIds: ["blocked-video"] })); }
    if (invalidClass === "ASSET_CAP_REACHED") fixture.items.push(...[1000, 1001, 1002, 1003, 1004].map((id) => item(id, { assetIds: reserve.usageEvidenceAllocation!.assetIds })));
    if (invalidClass === "SEQUENCE_FINGERPRINT_ALREADY_USED") fixture.items.push(item(1000, { sequence: reserve.usageEvidenceAllocation!.sequenceFingerprint }));
    if (invalidClass === "NOT_MATERIALIZABLE") reserve.usageEvidenceAllocation!.assetIds = [];
    const slots = Array.from({ length: 60 }, (_, i) => item(i + 1));
    const items = [...slots, ...fixture.items.filter((value) => value !== fixture.target)];
    const state = createOperationalAdmissionState(items);
    const before = structuredClone(state);
    const planner = operationalCandidateCoverageDecisions({ state, candidate: reserve, slots, policy });
    const prepared = prepareOperationalAdmissionEvaluator(state).coverageDecisions(reserve, slots, policy);
    expect(prepared).toEqual(planner);
    for (const [i, slot] of slots.entries()) {
      const canonical = evaluateOperationalCandidate({ state, candidate: reserve, policy, replacementContext: { slotId: slot.slotId, plannedPrimaryProductKey: slot.productKey, failedPrimaryProductKey: slot.productKey } });
      expect(planner[i]).toEqual(canonical);
      expect(canonical.eligible).toBe(false);
      expect(canonical.reasons.length).toBeGreaterThan(0);
      expect(isOperationalReserveCandidate(reserve, { items, item: slot, settings, maxSameSourceVideoDaily: 1, cappedSourceIds: ["blocked-video"] })).toBe(canonical.eligible);
    }
    expect(operationalCandidateCoverageSlots({ state, candidate: reserve, slots, policy })).toEqual([]);
    expect(state).toEqual(before);
  });

  it("binds a prepared evaluator to its private snapshot and revalidates fresh state independently", () => {
    const fixture = base();
    const state = createOperationalAdmissionState(fixture.items);
    const prepared = prepareOperationalAdmissionEvaluator(state);
    const input = { candidate: fixture.candidate, policy: operationalAdmissionPolicy(settings, 15), replacementContext: { slotId: fixture.target.slotId } };
    expect(prepared.evaluate(input).eligible).toBe(true);
    state.usedProductIds.push(fixture.candidate.candidate.productKey);
    expect(evaluateOperationalCandidate({ ...input, state }).eligible).toBe(false);
    expect(prepareOperationalAdmissionEvaluator(state).evaluate(input).eligible).toBe(false);
    expect(prepared.evaluate(input).eligible).toBe(true);
  });

  it("admits a fully bound candidate and returns a deterministic state delta", () => {
    const fixture = base();
    const decision = decide(fixture.items, fixture.target, fixture.candidate);
    expect(decision).toMatchObject({ eligible: true, reasons: [], stateDelta: { categoryBefore: 0, categoryAfter: 1, categoryMaximum: 3 } });
    expect(decision.prefixStateHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("excludes the failed primary assignment while evaluating its replacement", () => {
    const fixture = base();
    fixture.target.candidate.category = "full"; fixture.target.candidate.categoryPath = "full";
    fixture.candidate.candidate.category = "full"; fixture.candidate.candidate.categoryPath = "full";
    fixture.items.push(item(10, { category: "full" }), item(11, { category: "full" }));
    const decision = decide(fixture.items, fixture.target, fixture.candidate);
    expect(decision.eligible).toBe(true);
    expect(decision.stateDelta).toMatchObject({ categoryBefore: 2, categoryAfter: 3, categoryMaximum: 3 });
  });

  it("rejects category cap without weakening the configured maximum", () => {
    const fixture = base();
    fixture.candidate.candidate.category = "full"; fixture.candidate.candidate.categoryPath = "full";
    fixture.items.push(item(10, { category: "full" }), item(11, { category: "full" }), item(12, { category: "full" }));
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("CATEGORY_CAP_REACHED");
  });

  it("rejects family cap", () => {
    const fixture = base();
    fixture.items.push(item(10, { category: fixture.candidate.candidate.category, name: fixture.candidate.candidate.canonicalProductName }));
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("FAMILY_CAP_REACHED");
  });

  it("rejects a capped video source at its unchanged daily limit", () => {
    const fixture = base();
    fixture.items.push(item(10, { sourceIds: ["shared-video-source"] }));
    fixture.candidate.usageEvidenceAllocation!.sourceIds = ["shared-video-source"];
    const policy = operationalAdmissionPolicy(settings, 1, ["shared-video-source"]);
    expect(decide(fixture.items, fixture.target, fixture.candidate, policy).reasons).toContain("SOURCE_CAP_REACHED");
  });

  it("does not apply the video-source cap to sanitized image sources", () => {
    const fixture = base();
    fixture.items.push(item(10, { sourceIds: ["shared-image-source"] }));
    fixture.candidate.usageEvidenceAllocation!.sourceIds = ["shared-image-source"];
    expect(decide(fixture.items, fixture.target, fixture.candidate, operationalAdmissionPolicy(settings, 1, [])).eligible).toBe(true);
  });

  it("rejects exact asset reuse at the unchanged limit", () => {
    const fixture = base();
    fixture.candidate.usageEvidenceAllocation!.assetIds = ["shared-asset"];
    fixture.items.push(...Array.from({ length: 5 }, (_, index) => item(10 + index, { assetIds: ["shared-asset"] })));
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("ASSET_CAP_REACHED");
  });

  it("rejects a sequence fingerprint already assigned elsewhere", () => {
    const fixture = base();
    fixture.items.push(item(10, { sequence: fixture.candidate.usageEvidenceAllocation!.sequenceFingerprint }));
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("SEQUENCE_FINGERPRINT_ALREADY_USED");
  });

  it("rejects candidate reuse independently from cap state", () => {
    const fixture = base();
    fixture.items.push(item(10, { productKey: fixture.candidate.candidate.productKey, candidateId: fixture.candidate.candidate.candidateId }));
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("CANDIDATE_ALREADY_USED");
  });

  it("rejects allocation product binding mismatch", () => {
    const fixture = base();
    fixture.candidate.usageEvidenceAllocation!.productKey = "wrong-product";
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("PRODUCT_BINDING_INVALID");
  });

  it("rejects an affiliate-not-ready candidate", () => {
    const fixture = base(); fixture.candidate.candidate.selectedAffiliateUrl = "";
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("AFFILIATE_NOT_READY");
  });

  it("rejects a candidate without a materialization allocation", () => {
    const fixture = base(); fixture.candidate.usageEvidenceAllocation = undefined;
    expect(decide(fixture.items, fixture.target, fixture.candidate).reasons).toContain("NOT_MATERIALIZABLE");
  });

  it("applies state only after an eligible replacement is accepted", () => {
    const fixture = base(); const state = createOperationalAdmissionState(fixture.items);
    const decision = decide(fixture.items, fixture.target, fixture.candidate);
    const next = applyOperationalCandidate(state, fixture.candidate, decision);
    expect(next.assignments.find((entry) => entry.slotId === fixture.target.slotId)?.productKey).toBe(fixture.candidate.candidate.productKey);
    expect(state.assignments.find((entry) => entry.slotId === fixture.target.slotId)?.productKey).toBe(fixture.target.productKey);
  });

  it("refuses to apply an ineligible decision", () => {
    const fixture = base(); fixture.candidate.candidate.selectedAffiliateUrl = "";
    expect(() => applyOperationalCandidate(createOperationalAdmissionState(fixture.items), fixture.candidate, decide(fixture.items, fixture.target, fixture.candidate))).toThrow("OPERATIONAL_CANDIDATE_NOT_ELIGIBLE");
  });

  it("proves the sanitized Slot-042 zero-capacity signature before repair", () => {
    const target = item(42, { category: "target" });
    const items = [target, item(1, { category: "saturated" }), item(2, { category: "saturated" }), item(3, { category: "saturated", sequence: "used-sequence" })];
    const reserve = Array.from({ length: 8 }, (_, index) => candidate(100 + index, { category: "saturated", sequence: index < 2 ? "used-sequence" : `reserve-sequence-${index}` }));
    const coverage = buildOperationalReserveCoverage({ items, reserve, directSlots: [target], policy: operationalAdmissionPolicy(settings, 15) });
    expect(coverage).toMatchObject({ directSlotsWithOperationalFallback: 0, slotsWithZeroOperationalFallback: ["slot-042"], reasonCounts: { CATEGORY_CAP_REACHED: 8, SEQUENCE_FINGERPRINT_ALREADY_USED: 2 }, pass: false, safeCode: "OPERATIONAL_RESERVE_COVERAGE_GAP" });
  });

  it("reports materializable reserve separately from operational coverage", () => {
    const fixture = base(); fixture.candidate.candidate.category = "full"; fixture.candidate.candidate.categoryPath = "full";
    fixture.items.push(item(10, { category: "full" }), item(11, { category: "full" }), item(12, { category: "full" }));
    const coverage = buildOperationalReserveCoverage({ items: fixture.items, reserve: [fixture.candidate], directSlots: [fixture.target], policy: operationalAdmissionPolicy(settings, 15) });
    expect(fixture.candidate.usageEvidenceAllocation).toBeTruthy();
    expect(coverage.minFallbacksPerSlot).toBe(0);
  });

  it("computes deterministic global matching without requiring 60 reserves", () => {
    const fixture = base();
    const second = item(2, { category: "second" });
    const coverage = buildOperationalReserveCoverage({ items: [...fixture.items, second], reserve: [fixture.candidate, candidate(101, { category: "second" })], directSlots: [fixture.target, second], policy: operationalAdmissionPolicy(settings, 15) });
    expect(coverage.maximumBipartiteMatchingSize).toBe(2);
  });

  it("excludes reserve candidates with zero coverage", () => {
    const fixture = base(); fixture.candidate.candidate.selectedAffiliateUrl = "";
    const coverage = buildOperationalReserveCoverage({ items: fixture.items, reserve: [fixture.candidate], directSlots: [fixture.target], policy: operationalAdmissionPolicy(settings, 15) });
    expect(coverage.reserveCandidatesWithZeroCoverage).toEqual([fixture.candidate.candidate.candidateId]);
  });

  it("planner-fast coverage and full coverage use the same eligibility semantics", () => {
    const fixture = base(); const state = createOperationalAdmissionState(fixture.items);
    const fast = operationalCandidateCoverageSlots({ state, candidate: fixture.candidate, slots: [fixture.target], policy: operationalAdmissionPolicy(settings, 15) });
    const full = buildOperationalReserveCoverage({ items: fixture.items, reserve: [fixture.candidate], directSlots: [fixture.target], policy: operationalAdmissionPolicy(settings, 15) });
    expect(fast).toEqual(full.slotCoverage.filter((slot) => slot.operationalFallbackCount > 0).map((slot) => slot.slotId));
  });

  it("runtime wrapper and canonical evaluator have exact eligibility parity", () => {
    const fixture = base();
    expect(isOperationalReserveCandidate(fixture.candidate, { items: fixture.items, item: fixture.target, settings, maxSameSourceVideoDaily: 15 }))
      .toBe(decide(fixture.items, fixture.target, fixture.candidate).eligible);
  });

  it("serializes and reads operational coverage without losing the evidence contract", () => {
    const fixture = base();
    const coverage = buildOperationalReserveCoverage({ items: fixture.items, reserve: [fixture.candidate], directSlots: [fixture.target], policy: operationalAdmissionPolicy(settings, 15) });
    expect(JSON.parse(JSON.stringify(coverage))).toEqual(coverage);
  });

  it("produces stable coverage evidence on repeated evaluation", () => {
    const fixture = base();
    const run = () => buildOperationalReserveCoverage({ items: fixture.items, reserve: [fixture.candidate], directSlots: [fixture.target], policy: operationalAdmissionPolicy(settings, 15) });
    expect(run()).toEqual(run());
  });
});

function base() {
  const target = item(1, { category: "primary" });
  return { target, items: [target], candidate: candidate(100, { category: "reserve" }) };
}
function decide(items: LocalQueueItem[], target: LocalQueueItem, reserve: ReserveCandidate, policy = operationalAdmissionPolicy(settings, 15)) {
  return evaluateOperationalCandidate({ state: createOperationalAdmissionState(items), candidate: reserve, policy, replacementContext: { slotId: target.slotId, plannedPrimaryProductKey: target.productKey, failedPrimaryProductKey: target.productKey, failureStage: "CREATIVE_SELECTION_FAILED" } });
}
function item(index: number, overrides: { category?: string; name?: string; productKey?: string; candidateId?: string; sourceIds?: string[]; assetIds?: string[]; sequence?: string } = {}) {
  const productKey = overrides.productKey ?? `product-${index}`;
  const category = overrides.category ?? `category-${index}`;
  const name = overrides.name ?? `product name ${index}`;
  return {
    id: `queue-${index}`, slotId: `slot-${String(index).padStart(3, "0")}`, queueDate: "2026-09-10", queueRank: index, productKey,
    candidate: candidate(index, { category, name, productKey, candidateId: overrides.candidateId, sourceIds: overrides.sourceIds, assetIds: overrides.assetIds, sequence: overrides.sequence }).candidate,
    usageEvidenceAllocation: allocation(productKey, overrides.sourceIds ?? [`source-${index}`], overrides.assetIds ?? [`asset-${index}`], overrides.sequence ?? `sequence-${index}`),
    candidateHistory: [{ productKey, canonicalProductName: name, startedAt: "", finishedAt: "", outcome: "active", reason: "PRIMARY_SELECTED", schedulerAttempts: 0, replacementOfProductKey: "" }],
  } as LocalQueueItem;
}
function candidate(index: number, overrides: { category?: string; name?: string; productKey?: string; candidateId?: string; sourceIds?: string[]; assetIds?: string[]; sequence?: string } = {}) {
  const productKey = overrides.productKey ?? `reserve-product-${index}`;
  const category = overrides.category ?? `reserve-category-${index}`;
  const name = overrides.name ?? `reserve name ${index}`;
  return {
    candidate: { candidateId: overrides.candidateId ?? `candidate-${index}`, productKey, rawProductId: `${index}`, rawProductName: name, canonicalProductName: name, productAliases: [name], productAnchors: [name], useCase: "desk_organization", category, categoryPath: category, priceText: "10000", rawProductUrl: `https://www.coupang.com/vp/products/${index}`, selectedAffiliateUrl: `https://link.coupang.com/a/test${index}`, productImageUrls: [`https://image.example/${index}.jpg`], sourceProvider: "coupang_partners_product_search", sourceRequestId: `request-${index}`, discoveredAt: "2026-09-10T00:00:00.000Z", sourceKeyword: "정리", eventContext: { eventId: "event", eventName: "event" } },
    score: { productKey, eventRelevanceScore: 20, motionSuitabilityScore: 20, policySafetyScore: 20, imageReadinessScore: 10, affiliateReadinessScore: 10, duplicatePenalty: 0, usageEvidenceScore: 10, finalProductScore: 90 - index / 1000, selectionRank: index, eligible: true, blockers: [] },
    insertedAt: "", claimedBySlot: "", claimedAt: "", queueDate: "2026-09-10",
    usageEvidenceAllocation: allocation(productKey, overrides.sourceIds ?? [`reserve-source-${index}`], overrides.assetIds ?? [`reserve-asset-${index}`], overrides.sequence ?? `reserve-sequence-${index}`),
  } as ReserveCandidate;
}
function allocation(productKey: string, sourceIds: string[], assetIds: string[], sequenceFingerprint: string) {
  return { productKey, useCase: "desk_organization", packId: `pack-${productKey}`, sourceIds, assetIds, sequenceFingerprint };
}
