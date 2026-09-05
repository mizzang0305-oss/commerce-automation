import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCodexCliArguments, buildCodexReviewOutputSchema, executeAuthenticatedCodexReview, loadCompletedCodexEvidenceFromReceipt, resolveCodexLaunch } from "../../src/lib/queue-scheduler/codexCliReviewExecutor";
import { cliInvocationError, captureCliProcess } from "../../src/lib/queue-scheduler/codexCliDiagnostics";
import { assertCodexExecutorReceipt } from "../../src/lib/queue-scheduler/codexReviewEvidence";
import { createCodexVisualEvidenceBinding, readCodexVisualEvidenceBinding } from "../../src/lib/queue-scheduler/visualEvidenceBinding";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("authenticated Codex CLI review executor", () => {
  it("does not retry a deterministic CLI upgrade requirement or invent review evidence", async () => {
    const fixture = await setup();
    const invoke = vi.fn(async () => { throw new Error("CODEX_REVIEW_CLI_UPGRADE_REQUIRED"); });
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_CLI_UPGRADE_REQUIRED", attempts: 1, retryable: false });
    expect(result.evidence).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
  });
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

  it("bypasses the Windows PowerShell wrapper when stdin is required", () => {
    const launch = resolveCodexLaunch(
      { APPDATA: "C:\\Users\\reviewer\\AppData\\Roaming" },
      "win32",
      "C:\\Program Files\\nodejs\\node.exe",
    );
    expect(launch.executable).toBe("C:\\Program Files\\nodejs\\node.exe");
    expect(launch.argsPrefix).toEqual([
      "C:\\Users\\reviewer\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\bin\\codex.js",
    ]);
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

  it("fails closed on an invalid structured binding without retry or evidence", async () => {
    const fixture = await setup();
    const invoke = vi.fn(async () => ({ exitCode: 0, output: { ...output(fixture, "pass"), queueId: "wrong" }, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } }));
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_STRUCTURED_BINDING_MISMATCH", retryable: false, attempts: 1 });
    expect(result.evidence).toBeUndefined();
    expect(invoke).toHaveBeenCalledTimes(1);
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
    const result = await executeAuthenticatedCodexReview({ ...fixture.request, operationNamespace: "diagnostic-test", diagnosticRoot: fixture.root, visualEvidencePaths: [join(fixture.root, "missing.jpg"), ...fixture.request.visualEvidencePaths.slice(1)], provenance: "diagnostic" }, { invoke, now: () => fixture.now });
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

describe("durable failure and diagnostic separation", () => {
  it("constrains the model timestamp to one host-owned request instant", () => {
    expect(buildCodexReviewOutputSchema(new Date("2026-09-05T02:00:00Z")).properties.reviewedAt).toEqual({ type: "string", const: "2026-09-05T02:00:00.000Z" });
  });

  it.each(["2026-09-05편집00:00:00+09:00", "2026-09-05T00:00:00.000Z"])("rejects malformed or invented timestamp %s without retry", async reviewedAt => {
    const fixture = await setup();
    const invoke = vi.fn(async (input: { schemaPath: string; prompt: string }) => {
      const schema = JSON.parse(await readFile(input.schemaPath, "utf8"));
      expect(schema.properties.reviewedAt.const).toBe(fixture.now.toISOString());
      expect(input.prompt).toContain(`requestedAt=${fixture.now.toISOString()}`);
      return { exitCode: 0, output: { ...output(fixture, "pass"), reviewedAt }, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } };
    });
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, now: () => fixture.now });
    expect(result.status).toBe("error"); expect(result.errorCode).toMatch(/^CODEX_REVIEW_STRUCTURED_TIMESTAMP_/u); expect(result.attempts).toBe(1); expect(result.evidence).toBeUndefined();
  });

  it.each(["CODEX_REVIEW_CLI_AUTH_UNAVAILABLE", "CODEX_REVIEW_CLI_SCHEMA_REJECTED", "CODEX_REVIEW_CLI_USAGE_LIMIT", "CODEX_REVIEW_CLI_IMAGE_INPUT_INVALID", "CODEX_REVIEW_CLI_UPGRADE_REQUIRED", "CODEX_REVIEW_CLI_EXIT_NONZERO"])("does not retry %s", async errorCode => {
    const fixture = await setup();
    const invoke = vi.fn(async () => { throw new Error(errorCode); });
    const delay = vi.fn(async () => {});
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, delay });
    expect(result).toMatchObject({ status: "error", errorCode, retryable: false, attempts: 1 });
    expect(invoke).toHaveBeenCalledTimes(1); expect(delay).not.toHaveBeenCalled(); expect(result.evidence).toBeUndefined();
    const repeated = await executeAuthenticatedCodexReview(fixture.request, { invoke, delay });
    expect(repeated.errorCode).toBe(errorCode); expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each(["CODEX_REVIEW_CLI_TEMPORARY_SERVICE", "CODEX_REVIEW_CLI_NETWORK"])("bounds explicit %s to two attempts with deterministic backoff", async code => {
    const fixture = await setup(), invoke = vi.fn(async () => { throw new Error(code); }), delay = vi.fn(async () => {});
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke, delay });
    expect(result).toMatchObject({ status: "error", retryable: false, attempts: 2 });
    expect(invoke).toHaveBeenCalledTimes(2); expect(delay).toHaveBeenCalledExactlyOnceWith(2000);
    await executeAuthenticatedCodexReview(fixture.request, { invoke, delay });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("retains true non-1 exit, hashes, classification and timestamps without raw secrets", async () => {
    const fixture = await setup();
    const secrets = 'Authorization: Bearer sentinel-auth\ntoken=sentinel-token\nrefresh_token=sentinel-refresh\nCookie: sentinel-cookie\napi_key=sentinel-key\nclient_secret=sentinel-client\npassword=sentinel-pass';
    const stdout = 'private product prompt content', stderr = `authentication failed\n${secrets}`;
    const processResult = await captureCliProcess({ command: process.execPath, args: ["-e", `process.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)});process.exitCode=7;`], cwd: fixture.root, env: process.env, timeoutMs: 5000, stdin: "" });
    const error = cliInvocationError({ process: processResult, classifiedErrorCode: "CODEX_REVIEW_CLI_AUTH_UNAVAILABLE", cliVersion: "0.153.1", executableFingerprint: "a".repeat(64) });
    const result = await executeAuthenticatedCodexReview(fixture.request, { invoke: async () => { throw error; } });
    const text = await readFile(result.receiptPath, "utf8"), receipt = JSON.parse(text);
    expect(receipt).toMatchObject({ status: "error", exitCode: 7, errorCode: "CODEX_REVIEW_CLI_AUTH_UNAVAILABLE", diagnostic: {
      cliExitCode: 7, stdoutSha256: createHash("sha256").update(stdout).digest("hex"), stderrSha256: createHash("sha256").update(stderr).digest("hex"),
      stdoutByteLength: Buffer.byteLength(stdout), stderrByteLength: Buffer.byteLength(stderr), stdoutWasTruncated: false, stderrWasTruncated: false,
      codexCliVersion: "0.153.1", resolvedExecutableFingerprint: "a".repeat(64), failurePhase: "exit",
    } });
    expect(receipt.startedAt).toBeTruthy(); expect(receipt.completedAt).toBeTruthy(); expect(receipt.diagnostic.processId).toBeGreaterThan(0);
    expect(receipt.diagnostic.sanitizedStderrExcerpt).toBeUndefined(); expect(receipt.diagnostic.sanitizedStdoutExcerpt).toBeUndefined();
    for (const value of ["sentinel-", "Authorization:", "Cookie:", "refresh_token", "private product prompt content"]) expect(text).not.toContain(value);
    expect(error.message).toBe("CODEX_REVIEW_CLI_AUTH_UNAVAILABLE");
  });

  it("uses the real child capture path and keeps unknown exits terminal", async () => {
    const fixture = await setup(), fake = join(fixture.root, "fake-codex.mjs");
    await writeFile(fake, 'if(process.argv.includes("--version")){console.log("codex-cli 0.153.1");}else{process.stdin.resume();process.stdin.on("end",()=>{process.stderr.write("opaque sentinel-secret");process.exitCode=9;});}');
    const result = await executeAuthenticatedCodexReview(fixture.request, { env: { ...process.env, CODEX_REVIEW_CODEX_COMMAND: fake } });
    expect(result).toMatchObject({ status: "error", errorCode: "CODEX_REVIEW_CLI_EXIT_NONZERO", attempts: 1, retryable: false });
    const receipt = JSON.parse(await readFile(result.receiptPath, "utf8"));
    expect(receipt.exitCode).toBe(9); expect(receipt.diagnostic.stderrSha256).toBe(createHash("sha256").update("opaque sentinel-secret").digest("hex"));
    expect(JSON.stringify(receipt)).not.toContain("sentinel-secret");
  });

  it("creates no promotion evidence for successful diagnostics or subsequent receipt loading", async () => {
    const fixture = await setup();
    const request = { ...fixture.request, provenance: "diagnostic" as const, operationNamespace: "diagnostic-test", diagnosticRoot: fixture.root };
    const result = await executeAuthenticatedCodexReview(request, { now: () => fixture.now, invoke: async () => ({ exitCode: 0, output: output(fixture, "pass"), usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } }) });
    expect(result.status).toBe("pass"); expect(result.evidence).toBeUndefined();
    await expect(loadCompletedCodexEvidenceFromReceipt(result.receiptPath)).rejects.toThrow("DIAGNOSTIC_PROMOTION_FORBIDDEN");
    expect(JSON.parse(await readFile(request.finalReviewArtifact, "utf8"))).toMatchObject({ reviewProvenance: "diagnostic", promotionEligible: false });
  });

  it("rejects a canonical write target before invocation or any operational change", async () => {
    const fixture = await setup(), canonical = await setup();
    const before = await readFile(canonical.request.machineQaSourceArtifact);
    const invoke = vi.fn();
    await expect(executeAuthenticatedCodexReview({ ...fixture.request, provenance: "diagnostic", operationNamespace: "diagnostic-test", diagnosticRoot: fixture.root, finalReviewArtifact: canonical.request.machineQaSourceArtifact }, { invoke })).rejects.toThrow("DIAGNOSTIC_PATH_ESCAPE");
    expect(await readFile(canonical.request.machineQaSourceArtifact)).toEqual(before); expect(invoke).not.toHaveBeenCalled();
  });
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "codex-review-diagnostic-")); roots.push(root);
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
