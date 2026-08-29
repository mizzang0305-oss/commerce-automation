import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_QUEUE_SCHEDULER_SETTINGS, LocalQueueRepository } from "../../src/lib/queue-scheduler";
import { createTestCodexEvidence } from "./testCodexEvidence";
import type { CodexReviewEvidenceV2 } from "../../src/lib/queue-scheduler/types";
import type { RankedLiveProduct } from "../../src/lib/live-product-video";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("Codex review evidence v2", () => {
  it("rechecks exact path, SHA-256, size, queue, product, source artifact, and fresh timestamp before promotion", async () => {
    const fixture = await readyFixture();
    const cases: Array<[Partial<CodexReviewEvidenceV2>, string]> = [
      [{ queueId: "missing-queue-id" }, "CODEX_VISUAL_REVIEW_QUEUE_ITEM_NOT_FOUND"],
      [{ productKey: "other-product" }, "CODEX_VISUAL_REVIEW_PRODUCT_MISMATCH"],
      [{ videoPath: fixture.otherVideoPath }, "CODEX_VISUAL_REVIEW_VIDEO_PATH_MISMATCH"],
      [{ videoSha256: "0".repeat(64) }, "CODEX_VISUAL_REVIEW_VIDEO_SHA256_MISMATCH"],
      [{ videoSize: fixture.evidence.videoSize + 1 }, "CODEX_VISUAL_REVIEW_VIDEO_SIZE_MISMATCH"],
      [{ sourceReviewArtifact: fixture.otherVideoPath }, "CODEX_VISUAL_REVIEW_SOURCE_ARTIFACT_MISMATCH"],
      [{ machineQaDigest: "0".repeat(64) }, "CODEX_VISUAL_REVIEW_MACHINE_QA_DIGEST_MISMATCH"],
      [{ regenerationCount: 1 }, "CODEX_VISUAL_REVIEW_REGENERATION_COUNT_INVALID"],
      [{ reviewedAt: new Date(fixture.now.getTime() - 5 * 60_000 - 1).toISOString() }, "CODEX_VISUAL_REVIEW_TIMESTAMP_NOT_FRESH"]
    ];
    for (const [change, code] of cases) {
      await expect(fixture.repository.recordCodexVisualReviews({ reviews: [{ ...fixture.evidence, ...change }], now: fixture.now })).rejects.toThrow(code);
      expect((await fixture.repository.items()).find((item) => item.id === fixture.item.id)?.status).toBe("video_ready_machine_qa");
    }
    await writeFile(fixture.videoPath, "tampered-video");
    await expect(fixture.repository.recordCodexVisualReviews({ reviews: [fixture.evidence], now: fixture.now })).rejects.toThrow("CODEX_VISUAL_REVIEW_VIDEO_SHA256_MISMATCH");
  });

  it("requires complete unchanged-video origin bindings for carry-forward evidence", async () => {
    const fixture = await readyFixture();
    const items = await fixture.repository.items();
    const item = items.find((entry) => entry.id === fixture.item.id)!;
    item.operationCarryover = {
      prevalidatedCanary: true,
      sourceCanaryRunId: "operation-2026-08-07",
      sourceVideoHash: fixture.evidence.videoSha256,
      sourceReviewHash: fixture.evidence.machineQaDigest,
      carriedIntoOperationDate: "2026-08-08",
      originOperationNamespace: "operation-2026-08-07",
      originQueueId: "origin-queue-id",
      originVideoSha256: fixture.evidence.videoSha256,
      regenerationCount: 0,
    };
    await writeFile(fixture.repository.queuePath, `${JSON.stringify(items, null, 2)}\n`);
    await expect(fixture.repository.recordCodexVisualReviews({ reviews: [fixture.evidence], now: fixture.now })).rejects.toThrow("CODEX_VISUAL_REVIEW_CARRY_FORWARD_ORIGIN_REQUIRED");
    const carried = await createTestCodexEvidence({ operationNamespace: basename(fixture.repository.root), queueId: fixture.item.id, productKey: fixture.item.productKey, videoPath: fixture.videoPath, reviewedAt: fixture.now, reviewResult: "pass", sourceReviewArtifact: fixture.reviewPath, notes: "Fresh Codex inspection verified exact visual evidence.", receiptRoot: join(fixture.repository.root, "receipts-carried"), regenerationCount: 0, reviewProvenance: "natural", originOperationNamespace: "operation-2026-08-07", originQueueId: "origin-queue-id", originVideoSha256: fixture.evidence.videoSha256 });
    await expect(fixture.repository.recordCodexVisualReviews({ reviews: [carried], now: fixture.now })).resolves.toBe(1);
  });

  it("does not accept a caller-supplied historical reviewedAt for a new exact binding", async () => {
    const fixture = await readyFixture();
    const historical = { ...fixture.evidence, reviewedAt: "2026-08-07T00:00:00.000Z" };
    await expect(fixture.repository.recordCodexVisualReviews({ reviews: [historical], now: fixture.now })).rejects.toThrow("CODEX_VISUAL_REVIEW_TIMESTAMP_NOT_FRESH");
    expect(JSON.parse(await readFile(fixture.repository.queuePath, "utf8"))[0].reviewMetadata.codexReview).toBe("not_executed");
  });

  it("rejects legacy v1 receipts for pass promotion", async () => {
    const fixture = await readyFixture();
    const receipt = JSON.parse(await readFile(fixture.evidence.reviewReceiptPath, "utf8"));
    await writeFile(fixture.evidence.reviewReceiptPath, `${JSON.stringify({ ...receipt, schemaVersion: "queue-codex-review-executor-receipt-v1" }, null, 2)}\n`);
    const bytes = await readFile(fixture.evidence.reviewReceiptPath);
    await expect(fixture.repository.recordCodexVisualReviews({ reviews: [{ ...fixture.evidence, reviewReceiptSha256: createHash("sha256").update(bytes).digest("hex") }], now: fixture.now })).rejects.toThrow("CODEX_VISUAL_REVIEW_RECEIPT_BINDING_INVALID");
  });

  it("rejects digest-valid review files whose machine QA semantics are not passed", async () => {
    const fixture = await readyFixture();
    await writeFile(fixture.reviewPath, qaArtifact(fixture.item.productKey, false));
    const evidence = await createTestCodexEvidence({ operationNamespace: basename(fixture.repository.root), queueId: fixture.item.id, productKey: fixture.item.productKey, videoPath: fixture.videoPath, reviewedAt: fixture.now, reviewResult: "pass", sourceReviewArtifact: fixture.reviewPath, notes: "Fresh Codex inspection verified exact visual evidence.", receiptRoot: join(fixture.repository.root, "receipts"), regenerationCount: 0 });
    await expect(fixture.repository.recordCodexVisualReviews({ reviews: [evidence], now: fixture.now })).rejects.toThrow("CODEX_VISUAL_REVIEW_MACHINE_QA_NOT_PASSED");
  });
});

async function readyFixture() {
  const root = await mkdtemp(join(tmpdir(), "queue-codex-review-")); roots.push(root);
  const repository = new LocalQueueRepository(root);
  await repository.writeSettings({ ...DEFAULT_QUEUE_SCHEDULER_SETTINGS, enabled: true });
  const now = new Date("2026-08-08T00:00:00.000Z");
  await repository.insertRanked({ ranked: ranked(), queueDate: "2026-08-08", now, dueNow: true });
  const [item] = await repository.claimDue({ now, runId: "codex-review", limit: 1, leaseMinutes: 10, pilotMax: 9 });
  const videoPath = join(root, "video.mp4"); const otherVideoPath = join(root, "other.mp4"); const reviewPath = join(root, "run-manifest.json");
  await writeFile(videoPath, "exact-video"); await writeFile(otherVideoPath, "exact-video");
  await writeFile(reviewPath, qaArtifact(item.productKey, true));
  await repository.complete({ id: item.id, videoPath, reviewPath, creativeScore: 90, videoQualityScore: 92, now });
  const evidence = await createTestCodexEvidence({ operationNamespace: basename(root), queueId: item.id, productKey: item.productKey, videoPath, reviewedAt: now, reviewResult: "pass", sourceReviewArtifact: reviewPath, notes: "Fresh Codex inspection verified exact visual evidence.", receiptRoot: join(root, "receipts"), regenerationCount: 0 });
  return { repository, item, now, videoPath, otherVideoPath, reviewPath, evidence };
}

function ranked(): RankedLiveProduct[] {
  return [{ candidate: { candidateId: "candidate-1", productKey: "product-1", rawProductId: "1", rawProductName: "상품 1", canonicalProductName: "상품 1", productAliases: ["상품1"], productAnchors: ["상품1", "정리"], useCase: "desk_organization", category: "생활", categoryPath: "생활", priceText: "10000", rawProductUrl: "https://www.coupang.com/vp/products/1", selectedAffiliateUrl: "https://link.coupang.com/a/1", productImageUrls: ["https://image.example/1.jpg"], sourceProvider: "coupang_partners_product_search", sourceRequestId: "request-1", discoveredAt: "2026-08-08T00:00:00.000Z", sourceKeyword: "정리", eventContext: { eventId: "event", eventName: "event" } }, score: { productKey: "product-1", eventRelevanceScore: 20, motionSuitabilityScore: 20, policySafetyScore: 20, imageReadinessScore: 10, affiliateReadinessScore: 10, duplicatePenalty: 0, usageEvidenceScore: 10, finalProductScore: 90, selectionRank: 1, eligible: true, blockers: [] } }];
}

function qaArtifact(productKey: string, machineQaPassed: boolean) {
  return `${JSON.stringify({ version: "autonomous-video-review-v2", visualReviewExecuted: true, finalAutomatedQaPassed: machineQaPassed ? 1 : 0, items: [{ productKey, status: machineQaPassed ? "AUTO_QA_PASS" : "AUTO_QA_BLOCKED", machineQaPassed, finalAutomatedQaPassed: machineQaPassed, visualReviewExecuted: true, blockers: machineQaPassed ? [] : ["MACHINE_QA_FAILED"], publishReady: false, SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false }] })}\n`;
}
