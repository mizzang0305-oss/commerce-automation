import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
import {
  assertImmutableReviewOperationBinding,
  loadAndAssertImmutableReviewOperationBinding,
  planImmutableReviewOperationBindings,
} from "../../src/lib/queue-scheduler/immutableReviewBinding";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";
import type { CodexReviewEvidenceV2, ImmutableCodexReviewOperationBindingRefV1, LocalQueueItem } from "../../src/lib/queue-scheduler/types";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";
import { createTestCodexEvidence } from "./testCodexEvidence";
import { firstOperationStatus } from "../../src/lib/daily69-first-operation";
import { collectLevel3CompletionInput } from "../../src/lib/daily69-first-operation/postCloseout";
import { applyImmutableBindings } from "../../scripts/daily69-first-operation/apply-immutable-review-bindings";
import { firstOperationNamespace } from "../../src/lib/daily69-first-operation/operationIdentity";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

// This suite exercises the complete nine-item immutable binding lifecycle with
// real filesystem publication and hashing. Keep its budget local to the suite
// so unrelated host worker contention cannot trip Vitest's 10 second default.
describe("immutable Codex review origin to operation binding", { timeout: 30_000 }, () => {
  it("plans, applies, and reopens canonical attempt-2 bindings without changing immutable origin clocks", async () => {
    const fixture = await bindingFixture(2);
    const before = await readFile(fixture.registryPath, "utf8");
    const planned = await plan(fixture);
    expect(planned.bindings.every((binding) => binding.targetOperationNamespace === fixture.operationNamespace && binding.targetOperationDate === "2099-01-02")).toBe(true);
    await atomicWriteJson(join(fixture.operationRoot, "operation-manifest.json"), { schemaVersion: "daily69-first-operation-v2", namespace: fixture.operationNamespace, operationDate: "2099-01-02", attemptNumber: 2, previousAttemptNamespace: "operation-2099-01-02", armStatus: "prepared" });
    await expect(applyImmutableBindings({ queueRoot: fixture.operationRoot, originRegistryPath: fixture.registryPath, now: fixture.boundAt })).resolves.toMatchObject({ updated: 9 });
    const updated = await fixture.repository.items();
    for (const [index, item] of updated.entries()) {
      const binding = await loadAndAssertImmutableReviewOperationBinding({ reference: item.reviewMetadata.operationBinding!, item, queueRoot: fixture.operationRoot });
      expect(binding.targetOperationNamespace).toBe(fixture.operationNamespace);
      expect(binding.originReviewedAt).toBe(fixture.evidence[index].reviewedAt);
      expect(binding.boundToOperationAt).toBe(fixture.boundAt.toISOString());
    }
    expect(await readFile(fixture.registryPath, "utf8")).toBe(before);
  });

  it("rejects attempt/date mismatch before writing immutable bindings", async () => {
    const fixture = await bindingFixture(2);
    await expect(planImmutableReviewOperationBindings({ ...basePlanInput(fixture), targetOperationDate: "2099-01-03" })).rejects.toThrow("IMMUTABLE_REVIEW_TARGET_NAMESPACE_INVALID");
    await expect(planImmutableReviewOperationBindings({ ...basePlanInput(fixture), targetOperationNamespace: "operation-2099-01-02-attempt-02" })).rejects.toThrow("IMMUTABLE_REVIEW_TARGET_NAMESPACE_INVALID");
    await atomicWriteJson(join(fixture.operationRoot, "operation-manifest.json"), { schemaVersion: "daily69-first-operation-v2", namespace: fixture.operationNamespace, operationDate: "2099-01-02", attemptNumber: 1, previousAttemptNamespace: "", armStatus: "prepared" });
    await expect(applyImmutableBindings({ queueRoot: fixture.operationRoot, originRegistryPath: fixture.registryPath, now: fixture.boundAt })).rejects.toThrow("FIRST_OPERATION_NAMESPACE_ATTEMPT_MISMATCH");
    expect((await fixture.repository.items()).every((item) => !item.reviewMetadata.operationBinding)).toBe(true);
    await expect(readFile(join(fixture.operationRoot, "review-bindings", "registry.json"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("creates exactly nine PASS bindings while preserving reviewedAt as a separate origin clock", async () => {
    const fixture = await bindingFixture();
    const planned = await plan(fixture);
    expect(planned.summary).toMatchObject({ candidates: 9, validOriginReceipts: 9, exactVideoShaMatches: 9, exactProductMatches: 9, reviewPass: 9, machineQaValid: 9, bindingsWouldPass: 9, fakeReviewedAtMutations: 0, aiReviewExecutions: 0 });
    expect(planned.bindings.every((entry, index) => entry.originReviewedAt === fixture.evidence[index].reviewedAt
      && entry.boundToOperationAt === fixture.boundAt.toISOString()
      && !("reviewedAt" in entry))).toBe(true);
  });

  it.each([1, 2])("stores digest-bound references and preserves post-audit binding for attempt %d", async (attemptNumber) => {
    const fixture = await bindingFixture(attemptNumber);
    const planned = await plan(fixture);
    const bindingRoot = join(fixture.operationRoot, "review-bindings");
    await mkdir(bindingRoot);
    const records = [];
    for (const binding of planned.bindings) {
      const bindingPath = join(bindingRoot, `${binding.targetSlotId}.json`);
      await atomicWriteJson(bindingPath, binding);
      const reference: ImmutableCodexReviewOperationBindingRefV1 = {
        schemaVersion: "queue-codex-review-operation-binding-ref-v1",
        bindingPath,
        bindingSha256: sha(await readFile(bindingPath)),
      };
      await expect(loadAndAssertImmutableReviewOperationBinding({ reference, item: fixture.items.find((item) => item.id === binding.targetQueueId)!, queueRoot: fixture.operationRoot, now: fixture.boundAt, enforceApplicationFreshness: true })).resolves.toMatchObject({ bindingResult: "pass" });
      records.push({ binding, reference });
    }
    await expect(fixture.repository.recordImmutableReviewOperationBindings({ bindings: records, now: fixture.boundAt })).resolves.toBe(9);
    const updated = await fixture.repository.items();
    expect(updated.filter((item) => item.status === "video_ready_autoqa" && item.reviewMetadata.codexReview === "pass" && item.reviewMetadata.operationBinding && !item.reviewMetadata.evidence)).toHaveLength(9);

    await mkdir(join(fixture.operationRoot, "closeout"));
    const manifest = { schemaVersion: "daily69-first-operation-v2", decision: "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_ARMED", operationDate: "2099-01-02", armedAt: fixture.boundAt.toISOString(), expectedGitHead: "a".repeat(40), namespace: fixture.operationNamespace, attemptNumber, previousAttemptNamespace: attemptNumber === 1 ? "" : "operation-2099-01-02", armStatus: "prepared", sourceNamespace: "source-canary", sourceDecision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY", sourceFileHashes: {}, sourceAssetHashes: {}, sourceBundleHash: "b".repeat(64), sourceHashAfterClone: "b".repeat(64), originalMutated: false, prevalidatedReady: 9, carryForwardCandidateCount: 9, verifiedReady: 9, scheduledRemaining: 0, batchSize: 3, reserve: 0, distinct: 9, schedule: [], safety: { SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, PLATFORM_UPLOAD: 0, GOOGLE_DRIVE_WRITE: 0, PRODUCTION_DB_WRITE: 0, R2_WRITE: 0 } } as const;
    await atomicWriteJson(join(fixture.operationRoot, "operation-manifest.json"), manifest);
    await atomicWriteJson(join(fixture.root, "active-operation.json"), { schemaVersion: "daily69-first-operation-pointer-v2", namespace: manifest.namespace, operationDate: manifest.operationDate, attemptNumber, expectedGitHead: manifest.expectedGitHead, armStatus: "prepared", decision: manifest.decision, SAFE_TO_UPLOAD: false });
    await atomicWriteJson(join(fixture.operationRoot, "closeout", "level3-retained-evidence.json"), { schemaVersion: "daily69-level3-retained-evidence-v1", namespace: manifest.namespace, operationDate: manifest.operationDate, expectedGitHead: manifest.expectedGitHead, media: {}, sheets: { exact: false, queueRows: 0, reserveRows: 0, syncRows: 0, duplicateIdentities: 0, preexistingChanged: 0, preexistingDeleted: 0, preexistingReordered: 0, snapshotHash: "" }, runs: { scheduledBatchRuns: 0, batchResults: 0, claimed: 0, completed: 0, failed: 0, runIdsMatched: true, batchClaimResultCardinalityMatched: true, claimedIdsObserved: 0, resultIdsObserved: 0, duplicateClaimIds: 0, duplicateResultIds: 0 }, safety: { uploadCalls: 0, platformCalls: 0, driveCalls: 0, dbWrites: 0, r2Writes: 0 } });
    const snapshot = await firstOperationStatus(fixture.operationRoot);
    const input = await collectLevel3CompletionInput(fixture.operationRoot, snapshot, { inspectMedia: async (path) => { const bytes = await readFile(path); return { videoPath: path, videoSha256: sha(bytes), videoSize: bytes.length, videoCodec: "h264", audioCodec: "aac", width: 1080, height: 1920, fps: 30, durationSeconds: 30, passed: true, blockers: [] }; } });
    expect(input.queue).toMatchObject({ directReviewBindings: 0, immutableCarryForwardBindings: 9, reviewEvidenceModeConflicts: 0 });
    expect(input.retainedEvidence?.media).toMatchObject({ codexReviewBindings: 9, exactVideoHashBindings: 9, directReviewBindings: 0, immutableCarryForwardBindings: 9, invalidCodexReviewBindings: 0 });
    expect(input.pointer).toMatchObject({ state: "MATCH" });
  });

  it("fails for a different video SHA, different product, rerender, machine-QA mismatch, or stale business eligibility", async () => {
    const fixture = await bindingFixture();
    const planned = await plan(fixture);
    const item = fixture.items[0];
    await expect(assertImmutableReviewOperationBinding({ binding: { ...planned.bindings[0], boundVideoSha256: "0".repeat(64) }, item, queueRoot: fixture.operationRoot })).rejects.toThrow("IMMUTABLE_REVIEW_BINDING_RECOMPUTE_MISMATCH");
    await expect(assertImmutableReviewOperationBinding({ binding: { ...planned.bindings[0], targetProductKey: "different-product" }, item, queueRoot: fixture.operationRoot })).rejects.toThrow("IMMUTABLE_REVIEW_BINDING_RECOMPUTE_MISMATCH");

    await writeFile(item.videoPath, "rerendered-video");
    await expect(plan(fixture)).rejects.toThrow("IMMUTABLE_REVIEW_VIDEO_IDENTITY_MISMATCH");
    await writeFile(item.videoPath, `video-${item.slotId}`);
    await writeFile(item.reviewPath, qaArtifact(item.productKey, false));
    await expect(plan(fixture)).rejects.toThrow("CODEX_VISUAL_REVIEW_RECEIPT_BINDING_INVALID");
    await writeFile(item.reviewPath, qaArtifact(item.productKey, true));
    item.candidate.selectedAffiliateUrl = "https://example.com/not-approved";
    await expect(planWithItems(fixture, fixture.items)).rejects.toThrow("IMMUTABLE_REVIEW_CURRENT_BUSINESS_ELIGIBILITY_INVALID");
  });

  it("fails for modified, missing, BLOCK, or ERROR origin receipts and for registry/schema downgrade", async () => {
    const modified = await bindingFixture();
    await writeFile(modified.evidence[0].reviewReceiptPath, "modified-receipt");
    await expect(plan(modified)).rejects.toThrow("CODEX_VISUAL_REVIEW_RECEIPT_DIGEST_MISMATCH");

    const missing = await bindingFixture();
    const missingRegistry = await registryValue(missing.registryPath);
    const missingPath = join(missing.root, "missing-receipt.json");
    missingRegistry.evidence[0].reviewReceiptPath = missingPath;
    missingRegistry.results[0].receiptPath = missingPath;
    await atomicWriteJson(missing.registryPath, missingRegistry);
    await expect(plan(missing)).rejects.toThrow("CODEX_VISUAL_REVIEW_RECEIPT_NOT_FOUND");

    const blocked = await bindingFixture();
    const blockedRegistry = await registryValue(blocked.registryPath);
    blockedRegistry.evidence[0].reviewResult = "block";
    blockedRegistry.evidence[0].hardBlockers = ["BLOCKED"];
    await atomicWriteJson(blocked.registryPath, blockedRegistry);
    await expect(plan(blocked)).rejects.toThrow("IMMUTABLE_REVIEW_ORIGIN_NOT_PASS");

    const errored = await bindingFixture();
    const errorRegistry = await registryValue(errored.registryPath);
    errorRegistry.results[0].status = "error";
    await atomicWriteJson(errored.registryPath, errorRegistry);
    await expect(plan(errored)).rejects.toThrow("IMMUTABLE_REVIEW_ORIGIN_RESULT_INVALID");

    const downgraded = await bindingFixture();
    const schemaRegistry = await registryValue(downgraded.registryPath);
    schemaRegistry.evidence[0].schemaVersion = "queue-codex-review-evidence-v1";
    await atomicWriteJson(downgraded.registryPath, schemaRegistry);
    await expect(plan(downgraded)).rejects.toThrow("IMMUTABLE_REVIEW_ORIGIN_REGISTRY_INVALID");
  });

  it("rejects a modified registry or binding file even when its path is unchanged", async () => {
    const fixture = await bindingFixture();
    const planned = await plan(fixture);
    const bindingRoot = join(fixture.operationRoot, "review-bindings");
    await mkdir(bindingRoot);
    const bindingPath = join(bindingRoot, "binding.json");
    await atomicWriteJson(bindingPath, planned.bindings[0]);
    const reference: ImmutableCodexReviewOperationBindingRefV1 = { schemaVersion: "queue-codex-review-operation-binding-ref-v1", bindingPath, bindingSha256: sha(await readFile(bindingPath)) };
    const registry = await registryValue(fixture.registryPath);
    registry.results.reverse();
    await atomicWriteJson(fixture.registryPath, registry);
    await expect(loadAndAssertImmutableReviewOperationBinding({ reference, item: fixture.items[0], queueRoot: fixture.operationRoot })).rejects.toThrow("IMMUTABLE_REVIEW_ORIGIN_REGISTRY_DIGEST_MISMATCH");
    await atomicWriteJson(fixture.registryPath, fixture.registryOriginal);
    await writeFile(bindingPath, `${JSON.stringify({ ...planned.bindings[0], bindingResult: "blocked" })}\n`);
    await expect(loadAndAssertImmutableReviewOperationBinding({ reference, item: fixture.items[0], queueRoot: fixture.operationRoot })).rejects.toThrow("IMMUTABLE_REVIEW_BINDING_FILE_DIGEST_MISMATCH");

    const outsidePath = join(fixture.root, "outside-binding.json");
    await atomicWriteJson(outsidePath, planned.bindings[0]);
    await expect(loadAndAssertImmutableReviewOperationBinding({ reference: { ...reference, bindingPath: outsidePath, bindingSha256: sha(await readFile(outsidePath)) }, item: fixture.items[0], queueRoot: fixture.operationRoot })).rejects.toThrow("IMMUTABLE_REVIEW_BINDING_PATH_OUTSIDE_OPERATION");
  });

  it("reopens every binding file before the atomic queue promotion", async () => {
    const fixture = await bindingFixture();
    const planned = await plan(fixture);
    const bindingRoot = join(fixture.operationRoot, "review-bindings");
    await mkdir(bindingRoot);
    const records = [];
    for (const binding of planned.bindings) {
      const bindingPath = join(bindingRoot, `${binding.targetSlotId}.json`);
      await atomicWriteJson(bindingPath, binding);
      records.push({
        binding,
        reference: {
          schemaVersion: "queue-codex-review-operation-binding-ref-v1" as const,
          bindingPath,
          bindingSha256: sha(await readFile(bindingPath)),
        },
      });
    }
    await writeFile(records[8].reference.bindingPath, `${JSON.stringify({ ...records[8].binding, bindingResult: "blocked" })}\n`);
    await expect(fixture.repository.recordImmutableReviewOperationBindings({ bindings: records, now: fixture.boundAt }))
      .rejects.toThrow("IMMUTABLE_REVIEW_BINDING_FILE_DIGEST_MISMATCH");
    const unchanged = await fixture.repository.items();
    expect(unchanged.every((item) => item.status === "video_ready_machine_qa" && item.reviewMetadata.codexReview === "not_executed"
      && !item.reviewMetadata.evidence && !item.reviewMetadata.operationBinding)).toBe(true);
  });

  it("rejects new direct items, stale application bindings, and post-operation binding timestamps", async () => {
    const fixture = await bindingFixture();
    const noCarry = structuredClone(fixture.items);
    noCarry[0].operationCarryover = undefined;
    await expect(planWithItems(fixture, noCarry)).rejects.toThrow("IMMUTABLE_REVIEW_PREPARED_OPERATION_BINDING_INVALID");
    await expect(planImmutableReviewOperationBindings({ ...basePlanInput(fixture), boundToOperationAt: new Date(fixture.boundAt.getTime() - 6 * 60_000), now: fixture.boundAt })).rejects.toThrow("IMMUTABLE_REVIEW_BINDING_TIMESTAMP_NOT_FRESH");
    await expect(planImmutableReviewOperationBindings({ ...basePlanInput(fixture), boundToOperationAt: new Date("2099-01-02T00:00:00+09:00"), now: new Date("2099-01-02T00:00:00+09:00") })).rejects.toThrow("IMMUTABLE_REVIEW_BINDING_WINDOW_INVALID");
  });
});

async function bindingFixture(attemptNumber = 1) {
  const root = await mkdtemp(join(tmpdir(), "immutable-review-binding-")); roots.push(root);
  const operationNamespace = firstOperationNamespace("2099-01-02", attemptNumber);
  const operationRoot = join(root, operationNamespace);
  await mkdir(operationRoot);
  const repository = new LocalQueueRepository(operationRoot);
  await repository.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, dailyTargetCount: 9, pilotMaxDailyItems: 9, processingDailyCap: 9, enabled: true });
  const machineFinishedAt = new Date("2098-12-31T09:00:00.000Z");
  const rankedItems = ranked(9);
  await repository.insertRanked({ ranked: rankedItems, queueDate: "2098-12-31", now: machineFinishedAt, dueNow: true });
  const claimed = await repository.claimDue({ now: machineFinishedAt, runId: "binding-fixture", limit: 9, leaseMinutes: 10, pilotMax: 9 });
  const evidence: CodexReviewEvidenceV2[] = [];
  for (const item of claimed) {
    const videoPath = join(root, `video-${item.slotId}.mp4`);
    const reviewPath = join(root, `qa-${item.slotId}.json`);
    await writeFile(videoPath, `video-${item.slotId}`);
    await writeFile(reviewPath, qaArtifact(item.productKey, true));
    await repository.complete({ id: item.id, videoPath, reviewPath, creativeScore: 90, videoQualityScore: 92, now: machineFinishedAt });
    evidence.push(await createTestCodexEvidence({
      operationNamespace: "operation-2099-01-01",
      slotId: item.slotId,
      queueId: item.id,
      productKey: item.productKey,
      videoPath,
      reviewedAt: new Date(machineFinishedAt.getTime() + Number(item.queueRank) * 1_000),
      reviewResult: "pass",
      sourceReviewArtifact: reviewPath,
      notes: "Authenticated Codex review passed exact immutable visual evidence.",
      receiptRoot: join(root, "origin-receipts"),
      regenerationCount: 0,
      reviewProvenance: "carry_forward_revalidation",
      originOperationNamespace: "source-canary",
      originQueueId: item.id,
      originVideoSha256: sha(await readFile(videoPath)),
    }));
  }
  const items = await repository.items();
  for (const [index, item] of items.entries()) {
    item.queueDate = "2099-01-02";
    item.usageEvidenceAllocation = { productKey: item.productKey, useCase: item.candidate.useCase, packId: `pack-${index + 1}`, assetIds: [`asset-${index + 1}`], sequenceFingerprint: `sequence-${index + 1}`, sourceIds: [`source-${index + 1}`] };
    item.operationCarryover = {
      prevalidatedCanary: true,
      sourceCanaryRunId: "source-canary",
      sourceVideoHash: evidence[index].videoSha256,
      sourceReviewHash: evidence[index].machineQaDigest,
      carriedIntoOperationDate: "2099-01-02",
      originOperationNamespace: "source-canary",
      originQueueId: item.id,
      originVideoSha256: evidence[index].videoSha256,
      regenerationCount: 0,
    };
  }
  await atomicWriteJson(repository.queuePath, items);
  const exactBindings = evidence.map((entry) => ({ queueId: entry.queueId, productKey: entry.productKey, videoSha256: entry.videoSha256, machineQaSourceSha256: entry.machineQaSourceSha256 }));
  const registryOriginal = {
    schemaVersion: "daily69-carry-forward-codex-review-registry-v1",
    decision: "CARRY_FORWARD_CODEX_REVALIDATION_PASS",
    targetNamespace: "operation-2099-01-01",
    sourceNamespace: "source-canary",
    requested: 9,
    passed: 9,
    evidence,
    exactBindings,
    results: evidence.map((entry) => ({ queueId: entry.queueId, productKey: entry.productKey, status: "pass", receiptPath: entry.reviewReceiptPath })),
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
  const registryPath = join(root, "origin-registry.json");
  await atomicWriteJson(registryPath, registryOriginal);
  return { root, operationRoot, operationNamespace, repository, items, evidence, registryPath, registryOriginal, boundAt: new Date("2098-12-31T12:00:00.000Z") };
}

function plan(fixture: Awaited<ReturnType<typeof bindingFixture>>) { return planWithItems(fixture, fixture.items); }
function planWithItems(fixture: Awaited<ReturnType<typeof bindingFixture>>, items: LocalQueueItem[]) {
  return planImmutableReviewOperationBindings({ ...basePlanInput(fixture), items });
}
function basePlanInput(fixture: Awaited<ReturnType<typeof bindingFixture>>) {
  return { items: fixture.items, targetOperationNamespace: fixture.operationNamespace, targetOperationDate: "2099-01-02", originRegistryPath: fixture.registryPath, boundToOperationAt: fixture.boundAt, requirePreparedItems: true, now: fixture.boundAt };
}
async function registryValue(path: string) { return JSON.parse(await readFile(path, "utf8")) as { evidence: Array<Record<string, unknown>>; results: Array<Record<string, unknown>>; [key: string]: unknown }; }
function sha(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function qaArtifact(productKey: string, passed: boolean) { return `${JSON.stringify({ version: "autonomous-video-review-v2", visualReviewExecuted: true, finalAutomatedQaPassed: passed ? 1 : 0, items: [{ productKey, status: passed ? "AUTO_QA_PASS" : "AUTO_QA_BLOCKED", machineQaPassed: passed, finalAutomatedQaPassed: passed, visualReviewExecuted: true, blockers: passed ? [] : ["MACHINE_QA_FAILED"], publishReady: false, SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false }] })}\n`; }
function ranked(count: number): RankedLiveProduct[] { return Array.from({ length: count }, (_, index) => { const value = index + 1; return { candidate: { candidateId: `candidate-${value}`, productKey: `product-${value}`, rawProductId: String(value), rawProductName: `상품 ${value}`, canonicalProductName: `상품 ${value}`, productAliases: [`상품${value}`], productAnchors: [`상품${value}`, "정리"], useCase: "desk_organization", category: "생활", categoryPath: "생활", priceText: "10000", rawProductUrl: `https://www.coupang.com/vp/products/${value}`, selectedAffiliateUrl: `https://link.coupang.com/a/${value}`, productImageUrls: [`https://image.example/${value}.jpg`], sourceProvider: "coupang_partners_product_search", sourceRequestId: `request-${value}`, discoveredAt: "2098-12-31T00:00:00.000Z", sourceKeyword: "정리", eventContext: { eventId: "event", eventName: "event" } }, score: { productKey: `product-${value}`, eventRelevanceScore: 20, motionSuitabilityScore: 20, policySafetyScore: 20, imageReadinessScore: 10, affiliateReadinessScore: 10, duplicatePenalty: 0, usageEvidenceScore: 10, finalProductScore: 90, selectionRank: value, eligible: true, blockers: [] } }; }); }
