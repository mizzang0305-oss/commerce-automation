import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureCodexReviewEvidence } from "../../src/lib/queue-scheduler/codexReviewEvidence";

export async function createTestCodexEvidence(input: {
  operationNamespace: string;
  queueId: string;
  productKey: string;
  videoPath: string;
  reviewedAt: Date;
  reviewResult: "pass" | "block";
  sourceReviewArtifact: string;
  notes: string;
  receiptRoot: string;
  regenerationCount?: number;
  reviewProvenance?: "natural" | "carry_forward_revalidation";
  originOperationNamespace?: string;
  originQueueId?: string;
  originVideoSha256?: string;
}) {
  await mkdir(input.receiptRoot, { recursive: true });
  const [video, source] = await Promise.all([readFile(input.videoPath), readFile(input.sourceReviewArtifact)]);
  const videoSha256 = sha(video);
  const sourceSha256 = sha(source);
  const hardBlockers = input.reviewResult === "pass" ? [] : ["TEST_VISUAL_BLOCKER"];
  const reviewProvenance = input.reviewProvenance ?? "natural";
  const receiptPath = join(input.receiptRoot, `${input.queueId.replace(/[^A-Za-z0-9_-]/gu, "_")}-receipt.json`);
  await writeFile(receiptPath, `${JSON.stringify({
    schemaVersion: "queue-codex-review-executor-receipt-v1",
    status: "completed",
    invoked: true,
    provenance: reviewProvenance,
    operationNamespace: input.operationNamespace,
    queueId: input.queueId,
    productKey: input.productKey,
    videoPath: input.videoPath,
    videoSha256,
    videoSize: video.length,
    machineQaSourceArtifact: input.sourceReviewArtifact,
    machineQaSourceSha256: sourceSha256,
    finalReviewArtifact: input.sourceReviewArtifact,
    finalReviewArtifactSha256: sourceSha256,
    visualEvidence: [],
    reviewResult: input.reviewResult,
    hardBlockers,
    safeSummary: input.notes,
    reviewedAt: input.reviewedAt.toISOString(),
    reviewerType: "codex",
    executorType: "authenticated_codex_cli",
    attempt: 1,
    exitCode: 0,
    usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 },
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  }, null, 2)}\n`, "utf8");
  return captureCodexReviewEvidence({
    ...input,
    hardBlockers,
    safeSummary: input.notes,
    executorType: "authenticated_codex_cli",
    reviewProvenance,
    reviewReceiptPath: receiptPath,
  });
}

function sha(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
