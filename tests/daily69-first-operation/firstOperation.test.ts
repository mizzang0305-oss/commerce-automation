import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { armFirstOperation, closeoutFirstOperation, firstOperationStatus, verifySourceBundle } from "../../src/lib/daily69-first-operation";
import { DAILY_69_NO_UPLOAD_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { rankedProducts } from "../daily-69-control/fixtures";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("first no-upload Daily69 operation", () => {
  it("carries the prevalidated nine without rerendering and schedules exactly 20 hourly groups of three", async () => {
    const fixture = await sourceFixture();
    const before = await hashFile(join(fixture.sourceRoot, "queue.json"));
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "a".repeat(40) });
    const snapshot = await firstOperationStatus(armed.operationRoot);
    expect(armed.manifest.operationDate).toBe("2026-08-11");
    expect(armed.manifest.schedule).toHaveLength(20);
    expect(armed.manifest.schedule[0]).toEqual({ hourKst: 4, slots: ["slot-010", "slot-011", "slot-012"] });
    expect(armed.manifest.schedule[19]).toEqual({ hourKst: 23, slots: ["slot-067", "slot-068", "slot-069"] });
    expect(snapshot.status).toMatchObject({ total: 69, ready: 9, machineOnly: 0, scheduled: 60, reserve: 14, distinct: 83, unresolvedLeases: 0, productBindingMismatches: 0 });
    expect(snapshot.settings).toMatchObject({ mode: "no_upload_daily69_first_operation", processingDailyCap: 69, batchSize: 3, startHour: 4, endHour: 23, enabled: true, isPaused: false, observationMode: true, autoPauseAfterObservation: true, uploadEnabled: false });
    const carried = snapshot.items.slice(0, 9);
    expect(carried.every((item) => item.operationCarryover?.prevalidatedCanary === true && item.status === "video_ready_autoqa")).toBe(true);
    expect(snapshot.items.slice(9).every((item) => item.attemptCount === 0 && !item.videoPath && !item.reviewPath)).toBe(true);
    expect(await hashFile(join(fixture.sourceRoot, "queue.json"))).toBe(before);
    await expect(verifySourceBundle(fixture.sourceRoot, armed.manifest, fixture.parent)).resolves.toMatchObject({ bundleHash: armed.manifest.sourceBundleHash });
  }, 30_000);

  it("is idempotent and fails closed when original evidence changes", async () => {
    const fixture = await sourceFixture();
    const input = { sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "b".repeat(40) };
    const first = await armFirstOperation(input);
    const second = await armFirstOperation(input);
    expect(second.idempotent).toBe(true);
    await writeFile(join(fixture.sourceRoot, "source-proof.json"), "{}\n");
    await expect(verifySourceBundle(fixture.sourceRoot, first.manifest, fixture.parent)).rejects.toThrow("SOURCE_PROOF_HASH_MISMATCH");
  });

  it("pauses idempotently and does not arm day two while review is pending", async () => {
    const fixture = await sourceFixture();
    const armed = await armFirstOperation({ sourceRoot: fixture.sourceRoot, operationBase: fixture.operationBase, assetBoundaryRoot: fixture.parent, now: new Date("2026-08-09T17:00:00.000Z"), expectedGitHead: "c".repeat(40) });
    const first = await closeoutFirstOperation(armed.operationRoot);
    const second = await closeoutFirstOperation(armed.operationRoot);
    expect(first).toMatchObject({ decision: "NO_UPLOAD_DAILY69_FIRST_OPERATION_DAY_CLOSEOUT_PENDING", firstOperationReady: false, continuousDaily69Ready: false });
    expect(second.decision).toBe(first.decision);
    expect((await firstOperationStatus(armed.operationRoot)).settings).toMatchObject({ enabled: false, isPaused: true });
    await expect(readFile(join(armed.operationRoot, "shadow-next-day", "proof.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function sourceFixture() {
  const parent = await mkdtemp(join(tmpdir(), "daily69-first-operation-")); roots.push(parent);
  const sourceRoot = join(parent, "canary-source"); const operationBase = join(parent, "operations");
  await mkdir(sourceRoot); await mkdir(join(sourceRoot, "artifacts"));
  const repository = new LocalQueueRepository(sourceRoot);
  await repository.writeSettings({ ...DAILY_69_NO_UPLOAD_SETTINGS, enabled: true, isPaused: false });
  const now = new Date("2026-08-09T00:00:00.000Z");
  await repository.insertRanked({ ranked: rankedProducts(83), queueDate: "2026-08-09", now, dueNow: true });
  const queueWithAllocations = (await repository.items()).map((item) => ({ ...item, usageEvidenceAllocation: allocation(item.productKey, item.candidate.useCase) }));
  const reserveWithAllocations = (await repository.reserveCandidates()).map((item) => ({ ...item, usageEvidenceAllocation: allocation(item.candidate.productKey, item.candidate.useCase) }));
  await writeFile(repository.queuePath, `${JSON.stringify(queueWithAllocations)}\n`);
  await writeFile(repository.reservePath, `${JSON.stringify(reserveWithAllocations)}\n`);
  const reviewed: Array<{ productKey: string; passed: boolean }> = [];
  for (let batch = 0; batch < 3; batch += 1) {
    const claimed = await repository.claimDue({ now, runId: `canary-${batch}`, limit: 3, leaseMinutes: 10, pilotMax: 69 });
    const reviewPath = join(sourceRoot, "artifacts", `review-${batch}.json`); await writeFile(reviewPath, `{\"batch\":${batch}}`);
    for (const item of claimed) {
      const videoPath = join(sourceRoot, "artifacts", `${item.slotId}.mp4`); await writeFile(videoPath, `video-${item.slotId}`);
      await repository.complete({ id: item.id, videoPath, reviewPath, creativeScore: 90, videoQualityScore: 92, now });
      reviewed.push({ productKey: item.productKey, passed: true });
    }
  }
  await repository.recordCodexVisualReviews({ reviews: reviewed, now });
  await repository.writeSettings({ ...await repository.settings(), enabled: false, isPaused: true });
  await writeFile(join(sourceRoot, "source-proof.json"), `${JSON.stringify({ decision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY", active: 69, reserve: 14, distinct: 83, sourceMutation: 0 })}\n`);
  await writeFile(join(sourceRoot, "runs.json"), "[]\n");
  await writeFile(join(sourceRoot, "selected-registry.json"), "{}\n");
  await writeFile(join(sourceRoot, "final-summary.json"), `${JSON.stringify({ decision: "COUPANG_IMAGE_SKILL_USAGE_SCENES_V5_PROVEN_DAILY69_CAPACITY" })}\n`);
  return { parent, sourceRoot, operationBase };
}

async function hashFile(path: string) { return createHash("sha256").update(await readFile(path)).digest("hex"); }
function allocation(productKey: string, useCase: string) { return { productKey, useCase, packId: `pack-${productKey}`, assetIds: [`asset-${productKey}`], sequenceFingerprint: `sequence-${productKey}`, sourceIds: [`source-${productKey}`] }; }
