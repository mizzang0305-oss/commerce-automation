import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { captureCodexReviewEvidence } from "../../src/lib/queue-scheduler/codexReviewEvidence";

export async function createTestCodexEvidence(input: {
  operationNamespace: string;
  slotId?: string;
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
  const bindingRoot = join(input.receiptRoot, input.queueId.replace(/[^A-Za-z0-9_-]/gu, "_"));
  await mkdir(bindingRoot, { recursive: true });
  const receiptPath = join(bindingRoot, "receipt.json");
  const productName = `Test ${input.productKey}`;
  const productReferencePath = join(bindingRoot, "product-reference.jpg");
  const visualEvidencePaths = ["first-frame.jpg", "first-3-seconds-contact-sheet.jpg", "contact-sheet.jpg"].map((name) => join(bindingRoot, name));
  const visualEvidenceBindingPath = join(bindingRoot, "visual-evidence-binding.json");
  await Promise.all([
    writeFile(productReferencePath, "product-reference"),
    ...visualEvidencePaths.map((path, index) => writeFile(path, `visual-${index}`)),
    writeFile(visualEvidenceBindingPath, "visual-binding"),
  ]);
  const productReferenceBytes = await readFile(productReferencePath);
  const productReference = { path: productReferencePath, sha256: sha(productReferenceBytes), size: productReferenceBytes.length, identityType: "product_reference" };
  const visualEvidence = await Promise.all(visualEvidencePaths.map(async (path, index) => { const bytes = await readFile(path); return { path, sha256: sha(bytes), size: bytes.length, role: ["first_frame", "first_three_seconds_contact_sheet", "full_contact_sheet"][index] }; }));
  const usageEvidenceProvenance = { identityType: "generic_usage_example", sourceType: "historical_machine_qa_attested_generic_usage", productKey: input.productKey, machineQaArtifactSha256: sourceSha256, reviewedVideoSha256: videoSha256, exactProductUseClaimed: false };
  const visualEvidenceBindingSha256 = sha(await readFile(visualEvidenceBindingPath));
  await writeFile(receiptPath, `${JSON.stringify({
    schemaVersion: "queue-codex-review-executor-receipt-v2",
    status: "completed",
    invoked: true,
    provenance: reviewProvenance,
    operationNamespace: input.operationNamespace,
    slotId: input.slotId ?? "slot-001",
    queueId: input.queueId,
    productKey: input.productKey,
    productName,
    videoPath: input.videoPath,
    videoSha256,
    videoSize: video.length,
    machineQaSourceArtifact: input.sourceReviewArtifact,
    machineQaSourceSha256: sourceSha256,
    finalReviewArtifact: input.sourceReviewArtifact,
    finalReviewArtifactSha256: sourceSha256,
    productReference,
    visualEvidence,
    usageEvidenceProvenance,
    visualEvidenceBindingPath,
    visualEvidenceBindingSha256,
    reviewResult: input.reviewResult,
    hardBlockers,
    safeSummary: input.notes,
    reviewedAt: input.reviewedAt.toISOString(),
    reviewerType: "codex",
    executorType: "authenticated_codex_cli",
    attempt: 1,
    regenerationCount: input.regenerationCount ?? 0,
    ...(input.originOperationNamespace ? { originOperationNamespace: input.originOperationNamespace } : {}),
    ...(input.originQueueId ? { originQueueId: input.originQueueId } : {}),
    ...(input.originVideoSha256 ? { originVideoSha256: input.originVideoSha256 } : {}),
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
    slotId: input.slotId ?? "slot-001",
    productName,
    productReferenceSha256: productReference.sha256,
    visualEvidenceDigest: sha(Buffer.from(stableJson(visualEvidence))),
    usageEvidenceDigest: sha(Buffer.from(stableJson(usageEvidenceProvenance))),
    machineQaSourceArtifact: input.sourceReviewArtifact,
    machineQaSourceSha256: sourceSha256,
    visualEvidenceBindingSha256,
  });
}

function sha(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`; return JSON.stringify(value); }
