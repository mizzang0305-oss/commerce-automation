import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { armFirstOperation, closeoutFirstOperation, firstOperationStatus, promoteFirstOperationActivePointer, transitionFirstOperationArmStatus, verifySourceBundle } from "../../src/lib/daily69-first-operation";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { createTestCodexEvidence } from "../queue-scheduler/testCodexEvidence";
import type { CodexReviewEvidenceV2, LocalQueueItem, ReserveCandidate } from "../../src/lib/queue-scheduler/types";
import { rankedProducts } from "../daily-69-control/fixtures";
import { allocateUsageEvidence, createUsageAllocationState } from "../../src/lib/usage-evidence";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

const roots: string[] = [];
let sharedUsageAssets: Awaited<ReturnType<typeof createSharedUsageAssets>>;
// These fixtures isolate existing clone/lifecycle behavior. The actual runtime gate
// and no-write failure cases are exercised in runtimeCapsuleAdmission.test.ts.
vi.mock("../../src/lib/daily69-first-operation/runtimeCapsule", () => ({
  verifyFirstOperationCapsuleAdmission: vi.fn(async (runtime: unknown) => runtime),
}));
beforeAll(async () => { sharedUsageAssets = await createSharedUsageAssets(); });
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
afterAll(async () => { await rm(sharedUsageAssets.root, { recursive: true, force: true }); });

// This file exercises the full 83-candidate admission/materialization path. A
// host-level worker cohort can legitimately stretch Windows I/O far beyond the
// global unit-test budget, so keep the larger budget local to this integration suite.
describe("first no-upload Daily69 operation", { timeout: 30_000 }, () => {
  it("carries the prevalidated nine without rerendering and schedules exactly 20 hourly groups of three", async () => {
    const fixture = await sourceFixture();
    const before = await hashFile(join(fixture.sourceRoot, "queue.json"));
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "a".repeat(40) });
    const snapshot = await firstOperationStatus(armed.operationRoot);
    expect(armed.manifest.operationDate).toBe("2026-08-11");
    expect(armed.manifest).toMatchObject({ schemaVersion: "daily69-first-operation-v2", attemptNumber: 1, previousAttemptNamespace: "", armStatus: "prepared", carryForwardCandidateCount: 9, verifiedReady: 0, prevalidatedReady: 9, scheduledRemaining: 60, batchSize: 3 });
    await expect(readFile(join(fixture.operationBase, "active-operation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(armed.manifest.schedule).toHaveLength(20);
    expect(armed.manifest.schedule[0]).toEqual({ hourKst: 4, slots: ["slot-010", "slot-011", "slot-012"] });
    expect(armed.manifest.schedule[19]).toEqual({ hourKst: 23, slots: ["slot-067", "slot-068", "slot-069"] });
    expect(snapshot.status).toMatchObject({ total: 69, ready: 0, machineOnly: 9, reviewPending: 9, scheduled: 60, reserve: 14, distinct: 83, unresolvedLeases: 0, productBindingMismatches: 0 });
    expect(snapshot.status).toMatchObject({ affiliateReady: 69, affiliateMissing: 0, affiliateInvalid: 0, affiliateReadyForArm: true });
    expect(armed.manifest.affiliateReadiness).toMatchObject({ total: 69, affiliateReady: 69, readyForArm: true, rawUrlsPrinted: false });
    expect(snapshot.settings).toMatchObject({ mode: "no_upload_daily69_first_operation", processingDailyCap: 69, batchSize: 3, startHour: 4, endHour: 23, maxProductCandidates: 15, enabled: true, isPaused: false, observationMode: true, autoPauseAfterObservation: true, uploadEnabled: false });
    expect(snapshot.items.filter((item) => item.status === "scheduled").every((item) => item.maxProductCandidates === 15)).toBe(true);
    const carried = snapshot.items.slice(0, 9);
    expect(carried.every((item) => item.operationCarryover?.prevalidatedCanary === true && item.status === "video_ready_machine_qa" && item.reviewMetadata.codexReview === "not_executed")).toBe(true);
    expect(snapshot.items.slice(9).every((item) => item.attemptCount === 0 && !item.videoPath && !item.reviewPath)).toBe(true);
    expect(await hashFile(join(fixture.sourceRoot, "queue.json"))).toBe(before);
    expect(armed.manifest.sourceAssetBoundaryRoot).toBe(fixture.sourceRoot);
    await expect(verifySourceBundle(fixture.sourceRoot, armed.manifest)).resolves.toMatchObject({ bundleHash: armed.manifest.sourceBundleHash });
  }, 30_000);

  it("is idempotent and fails closed when original evidence changes", async () => {
    const fixture = await sourceFixture();
    const input = { sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "b".repeat(40) };
    const first = await armFirstOperation(input);
    const second = await armFirstOperation(input);
    expect(second.idempotent).toBe(true);
    await writeFile(join(fixture.sourceRoot, "source-proof.json"), "{}\n");
    await expect(verifySourceBundle(fixture.sourceRoot, first.manifest, fixture.parent)).rejects.toThrow("SOURCE_PROOF_HASH_MISMATCH");
  });

  it("preserves an explicit repaired-video origin and regeneration count across the operation clone", async () => {
    const fixture = await sourceFixture();
    const queuePath = join(fixture.sourceRoot, "queue.json");
    const queue = JSON.parse(await readFile(queuePath, "utf8"));
    const first = queue[0];
    const videoSha256 = await hashFile(first.videoPath);
    first.attemptCount = 2;
    first.operationCarryover = {
      prevalidatedCanary: true,
      sourceCanaryRunId: "recovery-source",
      sourceVideoHash: videoSha256,
      sourceReviewHash: await hashFile(first.reviewPath),
      carriedIntoOperationDate: "2026-08-11",
      originOperationNamespace: "recovery-source",
      originQueueId: first.id,
      originVideoSha256: videoSha256,
      regenerationCount: 1,
    };
    await writeFile(queuePath, `${JSON.stringify(queue)}\n`);
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "1".repeat(40) });
    const snapshot = await firstOperationStatus(armed.operationRoot);
    expect(snapshot.items[0].operationCarryover).toMatchObject({
      originOperationNamespace: "recovery-source",
      originQueueId: first.id,
      originVideoSha256: videoSha256,
      regenerationCount: 1,
    });
  });

  it("derives carry-forward, remaining, and schedule counts from an exact 12-ready source", async () => {
    const fixture = await sourceFixture({ readyCount: 12 });
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "9".repeat(40) });
    const snapshot = await firstOperationStatus(armed.operationRoot);
    expect(armed.manifest).toMatchObject({ prevalidatedReady: 12, carryForwardCandidateCount: 12, verifiedReady: 0, scheduledRemaining: 57, batchSize: 3 });
    expect(armed.manifest.schedule).toHaveLength(19);
    expect(armed.manifest.schedule[0]).toEqual({ hourKst: 4, slots: ["slot-013", "slot-014", "slot-015"] });
    expect(armed.manifest.schedule[armed.manifest.schedule.length - 1]).toEqual({ hourKst: 22, slots: ["slot-067", "slot-068", "slot-069"] });
    expect(snapshot.status).toMatchObject({ ready: 0, machineOnly: 12, scheduled: 57 });
  });

  it("promotes the active pointer only after projection and task verification", async () => {
    const fixture = await sourceFixture();
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "e".repeat(40) });
    await expect(promoteFirstOperationActivePointer(armed.operationRoot)).rejects.toThrow("FIRST_OPERATION_ACTIVE_POINTER_PROMOTION_FORBIDDEN");
    await transitionFirstOperationArmStatus(armed.operationRoot, "projection_verified");
    await expect(readFile(join(fixture.operationBase, "active-operation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await transitionFirstOperationArmStatus(armed.operationRoot, "tasks_armed");
    const pointer = await promoteFirstOperationActivePointer(armed.operationRoot);
    expect(pointer).toMatchObject({ namespace: "operation-2026-08-11", operationDate: "2026-08-11", attemptNumber: 1, armStatus: "tasks_armed", SAFE_TO_UPLOAD: false });
    await transitionFirstOperationArmStatus(armed.operationRoot, "running");
    expect(JSON.parse(await readFile(join(fixture.operationBase, "active-operation.json"), "utf8"))).toMatchObject({ armStatus: "running" });
    await transitionFirstOperationArmStatus(armed.operationRoot, "closing");
    await transitionFirstOperationArmStatus(armed.operationRoot, "closed_failed");
    expect(JSON.parse(await readFile(join(fixture.operationBase, "active-operation.json"), "utf8"))).toMatchObject({ armStatus: "closed_failed" });
    await expect(transitionFirstOperationArmStatus(armed.operationRoot, "running")).rejects.toThrow("FIRST_OPERATION_ARM_STATUS_TRANSITION_INVALID:closed_failed:running");
  }, 30_000);

  it("separates operation date from attempt namespace and rejects a missed target window", async () => {
    const fixture = await sourceFixture();
    const armed = await armFirstOperation({
      sourceRoot: fixture.sourceRoot,
      operationBase: fixture.operationBase,
      assetBoundaryRoot: fixture.parent,
      usageMaterializationAssetRoot: fixture.assetRoot,
      now: new Date("2026-08-16T00:00:00.000Z"),
      operationDate: "2026-08-17",
      namespace: "operation-2026-08-17-attempt-2",
      attemptNumber: 2,
      previousAttemptNamespace: "operation-2026-08-17",
      expectedGitHead: "f".repeat(40),
    });
    expect(armed.manifest).toMatchObject({ operationDate: "2026-08-17", namespace: "operation-2026-08-17-attempt-2", attemptNumber: 2, previousAttemptNamespace: "operation-2026-08-17", armStatus: "prepared" });
    expect(armed.manifest.materializationEligibility).toMatchObject({ pass: true });
    await transitionFirstOperationArmStatus(armed.operationRoot, "projection_verified");
    await transitionFirstOperationArmStatus(armed.operationRoot, "tasks_armed");
    await expect(promoteFirstOperationActivePointer(armed.operationRoot)).resolves.toMatchObject({ namespace: armed.manifest.namespace, operationDate: "2026-08-17", attemptNumber: 2, expectedGitHead: "f".repeat(40), armStatus: "tasks_armed", SAFE_TO_UPLOAD: false });
    await expect(armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: join(fixture.parent, "missed"), assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-17T00:00:00+09:00"), operationDate: "2026-08-17", attemptNumber: 2, previousAttemptNamespace: "operation-2026-08-17", expectedGitHead: "f".repeat(40) }))
      .rejects.toThrow("TARGET_OPERATION_DATE_WINDOW_MISSED");
  });

  it("fails closeout before lifecycle mutation when the promoted pointer is inconsistent", async () => {
    const fixture = await sourceFixture();
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "8".repeat(40) });
    await transitionFirstOperationArmStatus(armed.operationRoot, "projection_verified");
    await transitionFirstOperationArmStatus(armed.operationRoot, "tasks_armed");
    await promoteFirstOperationActivePointer(armed.operationRoot);
    const pointerPath = join(fixture.operationBase, "active-operation.json");
    const pointer = JSON.parse(await readFile(pointerPath, "utf8"));
    await writeFile(pointerPath, `${JSON.stringify({ ...pointer, expectedGitHead: "7".repeat(40) })}\n`);
    await expect(closeoutFirstOperation(armed.operationRoot)).rejects.toThrow("FIRST_OPERATION_ACTIVE_POINTER_MISMATCH");
    expect((await firstOperationStatus(armed.operationRoot)).manifest.armStatus).toBe("tasks_armed");
  });

  it("rejects a 68/69 affiliate-ready source before creating an operation or active pointer", async () => {
    const fixture = await sourceFixture({ missingAffiliateRanks: [69] });
    const sourceHash = await hashFile(join(fixture.sourceRoot, "queue.json"));
    await expect(armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "d".repeat(40) }))
      .rejects.toThrow("DAILY69_AFFILIATE_READINESS_INCOMPLETE");
    await expect(readFile(join(fixture.operationBase, "active-operation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(fixture.operationBase, "operation-2026-08-11", "operation-manifest.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    expect(await hashFile(join(fixture.sourceRoot, "queue.json"))).toBe(sourceHash);
  }, 30_000);

  it.each(["active", "reserve"] as const)("rejects one incompatible %s allocation before creating an operation or active pointer", async (incompatibleAllocation) => {
    const fixture = await sourceFixture({ incompatibleAllocation });
    await expect(armFirstOperation({
      sourceRoot: fixture.sourceRoot,
      operationBase: fixture.operationBase,
      assetBoundaryRoot: fixture.parent,
      usageMaterializationAssetRoot: fixture.assetRoot,
      now: new Date("2026-08-09T17:00:00.000Z"),
      expectedGitHead: "4".repeat(40),
    })).rejects.toThrow("MATERIALIZABLE_CAPACITY_SHORTFALL");
    await expect(readFile(join(fixture.operationBase, "active-operation.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(fixture.operationBase, "operation-2026-08-11", "operation-manifest.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("records zero operational fallback coverage as telemetry without blocking V1 operation creation", async () => {
    const fixture = await sourceFixture();
    const queuePath = join(fixture.sourceRoot, "queue.json");
    const reservePath = join(fixture.sourceRoot, "reserve-pool.json");
    const queue = JSON.parse(await readFile(queuePath, "utf8")) as LocalQueueItem[];
    const reserve = JSON.parse(await readFile(reservePath, "utf8")) as ReserveCandidate[];
    queue[0].candidate.category = "카테고리1";
    queue[0].candidate.categoryPath = "카테고리1>shifted";
    for (const entry of reserve) { entry.candidate.category = "카테고리1"; entry.candidate.categoryPath = "카테고리1>reserve"; }
    await writeFile(queuePath, `${JSON.stringify(queue)}\n`);
    await writeFile(reservePath, `${JSON.stringify(reserve)}\n`);
    const operationBase = join(fixture.parent, "operational-gap");
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "7".repeat(40) });
    expect(armed.manifest.operationalReserveCoverage).toMatchObject({ pass: false, safeCode: "OPERATIONAL_RESERVE_COVERAGE_GAP" });
    expect(armed.manifest.operationalReserveCoverage?.slotsWithZeroOperationalFallback.length).toBeGreaterThan(0);
    await expect(readFile(join(armed.operationRoot, "operational-reserve-coverage.json"), "utf8")).resolves.toContain("OPERATIONAL_RESERVE_COVERAGE_GAP");
  });

  it("uses a derived source parent namespace as the immutable carry-forward origin fallback", async () => {
    const fixture = await sourceFixture();
    const proofPath = join(fixture.sourceRoot, "source-proof.json");
    const proof = JSON.parse(await readFile(proofPath, "utf8"));
    await writeFile(proofPath, `${JSON.stringify({ ...proof, parentSourceNamespace: "origin-source" })}\n`);
    const armed = await armFirstOperation({
      sourceRoot: fixture.sourceRoot,
      operationBase: fixture.operationBase,
      assetBoundaryRoot: fixture.parent,
      usageMaterializationAssetRoot: fixture.assetRoot,
      now: new Date("2026-08-09T17:00:00.000Z"),
      expectedGitHead: "2".repeat(40),
    });
    const snapshot = await firstOperationStatus(armed.operationRoot);
    expect(snapshot.items.slice(0, 9).every((item) => item.operationCarryover?.originOperationNamespace === "origin-source"
      && item.operationCarryover.sourceCanaryRunId === "origin-source")).toBe(true);
    expect(armed.manifest.sourceNamespace).toBe("canary-source");
  });

  it("pauses idempotently and does not arm day two while review is pending", async () => {
    const fixture = await sourceFixture();
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, usageMaterializationAssetRoot: fixture.assetRoot, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "c".repeat(40) });
    const first = await closeoutFirstOperation(armed.operationRoot);
    const second = await closeoutFirstOperation(armed.operationRoot);
    expect(first).toMatchObject({ decision: "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING", firstOperationReady: false, continuousDaily69Ready: false });
    expect(second.decision).toBe(first.decision);
    expect((await firstOperationStatus(armed.operationRoot)).settings).toMatchObject({ enabled: false, isPaused: true });
    await expect(readFile(join(armed.operationRoot, "shadow-next-day", "proof.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function sourceFixture(options: { missingAffiliateRanks?: number[]; readyCount?: number; incompatibleAllocation?: "active" | "reserve" } = {}) {
  const parent = await mkdtemp(join(tmpdir(), "daily69-first-operation-")); roots.push(parent);
  const sourceRoot = join(parent, "canary-source"); const operationBase = join(parent, "operations");
  await mkdir(sourceRoot); await mkdir(join(sourceRoot, "artifacts"));
  const repository = new LocalQueueRepository(sourceRoot);
  await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false, processingDailyCap: 69 });
  const now = new Date("2026-08-09T00:00:00.000Z");
  const ranked = rankedProducts(83);
  await repository.insertRanked({ ranked, queueDate: "2026-08-09", now, dueNow: true });
  const registry = structuredClone(sharedUsageAssets.registry);
  const allocationState = createUsageAllocationState();
  const rankedByKey = new Map(ranked.map((entry) => [entry.candidate.productKey, entry]));
  const queueWithAllocations = (await repository.items()).map((item) => ({
    ...item,
    candidate: options.missingAffiliateRanks?.includes(item.queueRank)
      ? { ...item.candidate, selectedAffiliateUrl: "" }
      : item.candidate,
    usageEvidenceAllocation: allocateUsageEvidence({ candidate: rankedByKey.get(item.productKey)!, registry, state: allocationState }).allocation!
  }));
  const reserveWithAllocations = (await repository.reserveCandidates()).map((item) => ({ ...item, usageEvidenceAllocation: allocateUsageEvidence({ candidate: { candidate: item.candidate, score: item.score }, registry, state: allocationState }).allocation! }));
  if ([...queueWithAllocations, ...reserveWithAllocations].some((item) => !item.usageEvidenceAllocation)) throw new Error("TEST_MATERIALIZABLE_ALLOCATION_REQUIRED");
  if (options.incompatibleAllocation) {
    const allocation = options.incompatibleAllocation === "active" ? queueWithAllocations[0].usageEvidenceAllocation : reserveWithAllocations[0].usageEvidenceAllocation;
    const asset = registry.assets.find(({ assetId }) => assetId === allocation.assetIds[0])!;
    asset.sourceKind = "derived_frame_pack";
    asset.derivationOperation = "ffmpeg_scene_detected_segment_midpoint";
    asset.clipStartSeconds = 0;
    asset.clipEndSeconds = 0;
  }
  await writeFile(repository.queuePath, `${JSON.stringify(queueWithAllocations)}\n`);
  await writeFile(repository.reservePath, `${JSON.stringify(reserveWithAllocations)}\n`);
  const reviewed: CodexReviewEvidenceV2[] = [];
  const readyCount = options.readyCount ?? 9;
  if (readyCount % 3 !== 0) throw new Error("TEST_READY_COUNT_MUST_MATCH_BATCH_SIZE");
  for (let batch = 0; batch < readyCount / 3; batch += 1) {
    const claimed = await repository.claimDue({ now, runId: `canary-${batch}`, limit: 3, leaseMinutes: 10, pilotMax: 69 });
    const reviewPath = join(sourceRoot, "artifacts", `review-${batch}.json`);
    await writeFile(reviewPath, `${JSON.stringify({ version: "autonomous-video-review-v2", visualReviewExecuted: true, finalAutomatedQaPassed: claimed.length, items: claimed.map((item) => ({ productKey: item.productKey, status: "AUTO_QA_PASS", machineQaPassed: true, finalAutomatedQaPassed: true, visualReviewExecuted: true, blockers: [], publishReady: false, SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false })) })}\n`);
    for (const item of claimed) {
      const videoPath = join(sourceRoot, "artifacts", `${item.slotId}.mp4`); await writeFile(videoPath, `video-${item.slotId}`);
      await repository.complete({ id: item.id, videoPath, reviewPath, creativeScore: 90, videoQualityScore: 92, now });
      reviewed.push(await createTestCodexEvidence({
        operationNamespace: "canary-source",
        slotId: item.slotId,
        queueId: item.id,
        productKey: item.productKey,
        videoPath,
        reviewedAt: now,
        reviewResult: "pass",
        sourceReviewArtifact: reviewPath,
        notes: `fixture exact review evidence for ${item.productKey}`,
        receiptRoot: join(sourceRoot, "artifacts", "receipts"),
      }));
    }
  }
  await repository.recordCodexVisualReviews({ reviews: reviewed, now });
  await repository.writeSettings({ ...await repository.settings(), enabled: false, isPaused: true });
  await writeFile(join(sourceRoot, "source-proof.json"), `${JSON.stringify({ decision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY", active: 69, reserve: 14, distinct: 83, sourceMutation: 0 })}\n`);
  await writeFile(join(sourceRoot, "runs.json"), "[]\n");
  await writeFile(join(sourceRoot, "selected-registry.json"), `${JSON.stringify(registry)}\n`);
  await writeFile(join(sourceRoot, "final-summary.json"), `${JSON.stringify({ decision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" })}\n`);
  return { parent, sourceRoot, operationBase, assetRoot: sharedUsageAssets.assetRoot };
}

async function createSharedUsageAssets() {
  const root = await mkdtemp(join(tmpdir(), "daily69-first-operation-assets-"));
  const assetRoot = join(root, "assets");
  const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 30 });
  for (const pack of registry.packs) pack.categoryAllowlist = [];
  for (const asset of registry.assets) {
    const bytes = png();
    asset.sourceRelativeReference = asset.sourceRelativeReference.replace(/\.jpg$/u, ".png");
    const path = join(assetRoot, asset.sourceRelativeReference);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    asset.sourceSha256 = createHash("sha256").update(bytes).digest("hex");
    asset.derivedSha256 = asset.sourceSha256;
  }
  return { root, assetRoot, registry };
}

async function hashFile(path: string) { return createHash("sha256").update(await readFile(path)).digest("hex"); }
function png() { return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlOkAAAAASUVORK5CYII=", "base64"); }
