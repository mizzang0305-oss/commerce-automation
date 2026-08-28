import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAuthenticatedCodexReview } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("authenticated Codex CLI review executor", () => {
  it("creates exact structured evidence, immutable receipt binding, and deduplicates the same SHA", async () => {
    const fixture = await setup();
    const invoke = vi.fn(async () => ({ exitCode: 0, output: output(fixture, "pass"), usage: { inputTokens: 100, cachedInputTokens: 20, outputTokens: 40 } }));
    const first = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    expect(first).toMatchObject({ status: "pass", errorCode: "", attempts: 1, deduplicated: false });
    expect(first.evidence).toMatchObject({
      queueId: fixture.request.queueId,
      productKey: fixture.request.productKey,
      videoSha256: fixture.videoSha256,
      executorType: "authenticated_codex_cli",
      reviewProvenance: "natural",
      hardBlockers: [],
    });
    const receipt = JSON.parse(await readFile(first.receiptPath, "utf8"));
    expect(receipt).toMatchObject({ status: "completed", invoked: true, reviewResult: "pass", SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 });
    const second = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    expect(second).toMatchObject({ status: "pass", deduplicated: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("retries one invalid structured binding, then retains the second failure without evidence", async () => {
    const fixture = await setup();
    const invoke = vi.fn(async () => ({ exitCode: 0, output: { ...output(fixture, "pass"), queueId: "wrong" }, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } }));
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_STRUCTURED_BINDING_MISMATCH", retryable: false, attempts: 2 });
    expect(result.evidence).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("records a non-invoked controlled input failure and never creates promotion evidence", async () => {
    const fixture = await setup();
    const invoke = vi.fn();
    const result = await executeAuthenticatedCodexReview({ ...fixture.request, visualEvidencePaths: [join(fixture.root, "missing.jpg")], provenance: "diagnostic" }, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_INPUT_VISUAL_EVIDENCE_NOT_FOUND", attempts: 0 });
    expect(result.evidence).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(result.receiptPath, "utf8"))).toMatchObject({ status: "error", invoked: false, provenance: "diagnostic" });
  });
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "codex-cli-review-")); roots.push(root);
  const videoPath = join(root, "video.mp4");
  const imagePath = join(root, "contact.jpg");
  const machineQaSourceArtifact = join(root, "run-manifest.json");
  const finalReviewArtifact = join(root, "codex-review-source.json");
  const productKey = "product-1";
  await Promise.all([
    writeFile(videoPath, "exact-video"),
    writeFile(imagePath, "exact-image"),
    writeFile(machineQaSourceArtifact, `${JSON.stringify({ items: [{ productKey, status: "AWAITING_CODEX_VISUAL_REVIEW", machineQaPassed: true, blockers: [] }] })}\n`),
  ]);
  const now = new Date("2026-08-29T00:00:00.000Z");
  const videoSha256 = createHash("sha256").update("exact-video").digest("hex");
  const request = {
    operationNamespace: "operation-2026-08-30",
    queueId: "queue-1",
    productKey,
    videoPath,
    machineQaSourceArtifact,
    finalReviewArtifact,
    visualEvidencePaths: [imagePath],
    receiptRoot: join(root, "executor"),
    provenance: "natural" as const,
  };
  return { root, request, now, videoSha256 };
}

function output(fixture: Awaited<ReturnType<typeof setup>>, result: "pass" | "block") {
  return {
    schemaVersion: "queue-codex-review-output-v1",
    queueId: fixture.request.queueId,
    productKey: fixture.request.productKey,
    videoSha256: fixture.videoSha256,
    reviewResult: result,
    hardBlockers: result === "pass" ? [] : ["VISIBLE_RENDER_DEFECT"],
    safeSummary: "The attached local visual evidence is coherent and free of obvious hard blockers.",
    reviewedAt: fixture.now.toISOString(),
    reviewerType: "codex",
    executorType: "authenticated_codex_cli",
    firstFrameNote: "The opening frame is readable, stable, and visually coherent for the product.",
    firstThreeSecondsNote: "The early sequence preserves legible text and consistent product identity.",
    contactSheetNote: "The full contact sheet shows consistent framing without visible rendering defects.",
  };
}
