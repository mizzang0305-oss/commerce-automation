import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCodexCliArguments, executeAuthenticatedCodexReview } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";
import { assertCodexExecutorReceipt } from "../../src/lib/queue-scheduler/codexReviewEvidence";
import { createCodexVisualEvidenceBinding, readCodexVisualEvidenceBinding } from "../../src/lib/queue-scheduler/visualEvidenceBinding";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("authenticated Codex CLI review executor", () => {
  it("keeps the review prompt on stdin so Windows command-line limits cannot truncate it", () => {
    const args = buildCodexCliArguments({
      imagePaths: ["C:/very-long/image-1.jpg", "C:/very-long/image-2.jpg"],
      schemaPath: "C:/attempt/output-schema.json",
      outputPath: "C:/attempt/structured-output.json",
      cwd: "C:/attempt",
    });
    expect(args.slice(0, 2)).toEqual(["exec", "-"]);
    expect(args).toContain("--output-schema");
    expect(args.filter((value) => value === "--image")).toHaveLength(2);
  });

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
      productName: fixture.request.productName,
      productReferenceSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      visualEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
      usageEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    const receipt = JSON.parse(await readFile(first.receiptPath, "utf8"));
    expect(receipt).toMatchObject({ status: "completed", invoked: true, reviewResult: "pass", SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 });
    await expect(assertCodexExecutorReceipt({ ...first.evidence!, productName: undefined })).rejects.toThrow("CODEX_VISUAL_REVIEW_RECEIPT_BINDING_INVALID");
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

  it("rejects same-SHA deduplication when exact visual evidence binding changes", async () => {
    const fixture = await setup();
    const invoke = vi.fn(async () => ({ exitCode: 0, output: output(fixture, "pass"), usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } }));
    await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    const changedContact = fixture.request.visualEvidencePaths[2];
    await writeFile(changedContact, "changed-contact");
    const changedPaths = [...fixture.request.visualEvidencePaths];
    const changedBinding = await createCodexVisualEvidenceBinding({
      productKey: fixture.request.productKey,
      videoPath: fixture.request.videoPath,
      productReferencePath: fixture.request.productReferencePath,
      visualEvidencePaths: changedPaths,
      visualEvidenceRoles: fixture.request.visualEvidenceRoles,
      derivation: "ffmpeg_derived_from_immutable_video",
      outputPath: join(fixture.root, "changed-visual-evidence-binding.json"),
    });
    const result = await executeAuthenticatedCodexReview({
      ...fixture.request,
      visualEvidencePaths: changedPaths,
      visualEvidenceBindingPath: changedBinding.path,
    }, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_DUPLICATE_SHA_BINDING_CONFLICT", attempts: 1 });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("records a non-invoked controlled input failure and never creates promotion evidence", async () => {
    const fixture = await setup();
    const invoke = vi.fn();
    const result = await executeAuthenticatedCodexReview({ ...fixture.request, visualEvidencePaths: [join(fixture.root, "missing.jpg"), ...fixture.request.visualEvidencePaths.slice(1)], provenance: "diagnostic" }, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_INPUT_VISUAL_EVIDENCE_NOT_FOUND", attempts: 0 });
    expect(result.evidence).toBeUndefined();
    expect(invoke).not.toHaveBeenCalled();
    expect(JSON.parse(await readFile(result.receiptPath, "utf8"))).toMatchObject({ status: "error", invoked: false, provenance: "diagnostic" });
  });

  it("rejects an invalid visual evidence binding derivation", async () => {
    const fixture = await setup();
    const binding = JSON.parse(await readFile(fixture.request.visualEvidenceBindingPath, "utf8"));
    await writeFile(fixture.request.visualEvidenceBindingPath, `${JSON.stringify({ ...binding, derivation: "untrusted" }, null, 2)}\n`);
    await expect(readCodexVisualEvidenceBinding(fixture.request.visualEvidenceBindingPath)).rejects.toThrow("CODEX_REVIEW_VISUAL_BINDING_INVALID");
  });

  it("rejects historical usage provenance that does not match the reviewed video or machine QA artifact", async () => {
    for (const mismatch of ["video", "machine"] as const) {
      const fixture = await setup();
      const invoke = vi.fn();
      const machineQaArtifactSha256 = createHash("sha256").update(await readFile(fixture.request.machineQaSourceArtifact)).digest("hex");
      const result = await executeAuthenticatedCodexReview({
        ...fixture.request,
        usageEvidenceProvenance: {
          identityType: "generic_usage_example",
          sourceType: "historical_machine_qa_attested_generic_usage",
          productKey: fixture.request.productKey,
          machineQaArtifactSha256: mismatch === "machine" ? "0".repeat(64) : machineQaArtifactSha256,
          reviewedVideoSha256: mismatch === "video" ? "0".repeat(64) : fixture.videoSha256,
          exactProductUseClaimed: false,
        },
      }, { invoke, now: () => fixture.now });
      expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_USAGE_EVIDENCE_PROVENANCE_MISMATCH", attempts: 0 });
      expect(invoke).not.toHaveBeenCalled();
    }
  });

  it("rechecks retained allocated usage files at terminal validation", async () => {
    const fixture = await setup();
    const invoke = vi.fn(async () => ({ exitCode: 0, output: output(fixture, "pass"), usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } }));
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    await writeFile(fixture.request.usageEvidenceProvenance.sourceType === "allocated_sanitized_scene_pack" ? fixture.request.usageEvidenceProvenance.materializedUsagePath : "", "tampered-usage");
    await expect(assertCodexExecutorReceipt(result.evidence!)).rejects.toThrow("CODEX_REVIEW_USAGE_EVIDENCE_PROVENANCE_MISMATCH");
  });

  it("rejects a hash-consistent allocated manifest with unsafe semantic flags", async () => {
    const fixture = await setup();
    if (fixture.request.usageEvidenceProvenance.sourceType !== "allocated_sanitized_scene_pack") throw new Error("TEST_USAGE_PROVENANCE_INVALID");
    const manifest = JSON.parse(await readFile(fixture.request.usageEvidenceProvenance.materializationManifestPath, "utf8"));
    const bytes = `${JSON.stringify({ ...manifest, SAFE_TO_UPLOAD: true }, null, 2)}\n`;
    await writeFile(fixture.request.usageEvidenceProvenance.materializationManifestPath, bytes);
    const invoke = vi.fn();
    const result = await executeAuthenticatedCodexReview({
      ...fixture.request,
      usageEvidenceProvenance: { ...fixture.request.usageEvidenceProvenance, materializationManifestSha256: createHash("sha256").update(bytes).digest("hex") },
    }, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_USAGE_EVIDENCE_MANIFEST_INVALID", attempts: 0 });
    expect(invoke).not.toHaveBeenCalled();
  });
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "codex-cli-review-")); roots.push(root);
  const videoPath = join(root, "video.mp4");
  const productReferencePath = join(root, "product-reference.jpg");
  const visualEvidencePaths = [
    join(root, "first-frame.jpg"),
    join(root, "first-3-seconds-contact-sheet.jpg"),
    join(root, "contact-sheet.jpg")
  ];
  const machineQaSourceArtifact = join(root, "run-manifest.json");
  const finalReviewArtifact = join(root, "codex-review-source.json");
  const materializedUsagePath = join(root, "allocated-usage.mp4");
  const materializationManifestPath = join(root, "allocated-usage.manifest.json");
  const productKey = "product-1";
  const materializedUsageSha256 = createHash("sha256").update("usage-video").digest("hex");
  const sourceImageSha256s = ["4".repeat(64), "5".repeat(64), "6".repeat(64)];
  const materializationManifest = {
    schemaVersion: "allocated-usage-evidence-v1",
    productKey,
    useCase: "desk_organization",
    packId: "test-pack-01",
    sequenceFingerprint: "test-sequence",
    registrySha256: "1".repeat(64),
    allocationSha256: "2".repeat(64),
    rendererSpecSha256: "3".repeat(64),
    reviewClass: "CODEX_REVIEWED_LOCAL_ONLY",
    identityType: "generic_usage_example",
    ownerReviewStatus: "pass",
    noUploadAutomationEligible: true,
    publishEligible: false,
    SAFE_TO_UPLOAD: false,
    assets: ["asset-1", "asset-2", "asset-3"].map((assetId, index) => ({ assetId, localImageSha256: sourceImageSha256s[index] })),
    output: { fileName: "allocated-usage.mp4", sha256: materializedUsageSha256, sizeBytes: Buffer.byteLength("usage-video"), videoCodec: "h264", width: 1080, height: 1920, fps: 30, durationSeconds: 9, audioStreamCount: 0 },
  };
  await Promise.all([
    writeFile(videoPath, "exact-video"),
    writeFile(productReferencePath, "exact-product-reference"),
    ...visualEvidencePaths.map((path, index) => writeFile(path, `exact-image-${index}`)),
    writeFile(machineQaSourceArtifact, `${JSON.stringify({ items: [{ productKey, status: "AWAITING_CODEX_VISUAL_REVIEW", machineQaPassed: true, blockers: [] }] })}\n`),
    writeFile(materializedUsagePath, "usage-video"),
    writeFile(materializationManifestPath, `${JSON.stringify(materializationManifest, null, 2)}\n`),
  ]);
  const now = new Date("2026-08-29T00:00:00.000Z");
  const videoSha256 = createHash("sha256").update("exact-video").digest("hex");
  const visualEvidenceBinding = await createCodexVisualEvidenceBinding({
    productKey,
    videoPath,
    productReferencePath,
    visualEvidencePaths,
    visualEvidenceRoles: ["first_frame", "first_three_seconds_contact_sheet", "full_contact_sheet"],
    derivation: "ffmpeg_derived_from_immutable_video",
    outputPath: join(root, "visual-evidence-binding.json"),
  });
  const request = {
    operationNamespace: "operation-2026-08-30",
    slotId: "slot-001",
    queueId: "queue-1",
    productKey,
    productName: "테스트 정리 상품",
    videoPath,
    machineQaSourceArtifact,
    finalReviewArtifact,
    productReferencePath,
    visualEvidencePaths,
    visualEvidenceRoles: ["first_frame", "first_three_seconds_contact_sheet", "full_contact_sheet"] as const,
    visualEvidenceBindingPath: visualEvidenceBinding.path,
    usageEvidenceProvenance: {
      identityType: "generic_usage_example" as const,
      sourceType: "allocated_sanitized_scene_pack" as const,
      productKey,
      useCase: "desk_organization",
      packId: "test-pack-01",
      assetIds: ["asset-1", "asset-2", "asset-3"],
      sequenceFingerprint: "test-sequence",
      registrySha256: "1".repeat(64),
      allocationSha256: "2".repeat(64),
      rendererSpecSha256: "3".repeat(64),
      sourceImageSha256s,
      materializedUsagePath,
      materializedUsageSha256,
      materializationManifestPath,
      materializationManifestSha256: createHash("sha256").update(`${JSON.stringify(materializationManifest, null, 2)}\n`).digest("hex"),
      exactProductUseClaimed: false as const,
    },
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
