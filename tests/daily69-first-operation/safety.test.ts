import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("first operation task safety", () => {
  it("uses exact task names, 20 bounded triggers, expected-head guard, and no-upload wrappers", async () => {
    const install = await readFile("scripts/daily69-first-operation/install-tasks.ps1", "utf8");
    const principal = await readFile("scripts/daily69-first-operation/principal-identity.ps1", "utf8");
    const common = await readFile("scripts/daily69-first-operation/common-first-operation-no-upload.ps1", "utf8");
    const arm = await readFile("scripts/daily69-first-operation/arm.ts", "utf8");
    const preflight = await readFile("scripts/daily69-first-operation/preflight.ts", "utf8");
    const finalizer = await readFile("scripts/daily69-first-operation/run-finalizer-no-upload.ps1", "utf8");
    const recovery = await readFile("scripts/daily69-first-operation/run-four-slot-recovery.ts", "utf8");
    expect(install).toContain("Minz-Commerce-Scout-NoUpload-V1");
    expect(install).toContain("Minz-Commerce-VideoBatch-NoUpload-V1");
    expect(install).toContain("Minz-Commerce-ControlRunner-NoUpload-V1");
    expect(install).toContain("Minz-Commerce-Daily69-Closeout-NoUpload-V1");
    expect(install).toContain("expectedBatchHours");
    expect(install).toContain("TASK_SCHEDULER_OPERATIONAL_LOG_REQUIRED");
    expect(install).toContain('. (Join-Path $PSScriptRoot "principal-identity.ps1")');
    expect(install).toContain("Assert-PrincipalSecurityIdentifier -ExpectedSid $currentSid");
    expect(install).not.toMatch(/Principal\.UserId\s+-ne\s+\$currentSid/u);
    expect(principal).toContain("Security.Principal.SecurityIdentifier");
    expect(principal).toContain("Security.Principal.NTAccount");
    expect(principal).toContain("PRINCIPAL_IDENTITY_UNRESOLVABLE");
    expect(principal).not.toMatch(/EndsWith|Split\([^\n]+\\\\|ToLowerInvariant/u);
    expect(install).toContain("-MultipleInstances IgnoreNew");
    expect(install).toContain("-StartWhenAvailable");
    expect(install).toContain("FIRST_OPERATION_PROJECTION_VERIFICATION_REQUIRED");
    expect(install).toContain("daily69:first-day:arm-status");
    expect(install).toContain('$expectedTriggerDate = if ($Role -eq "finalizer") { $operationLocal.AddDays(1).Date } else { $operationLocal.Date }');
    expect(common).toContain("RUNTIME_GIT_HEAD_MISMATCH");
    expect(common).toContain("BATCH_SLOT_ALREADY_CLAIMED");
    expect(install).toContain("FIRST_OPERATION_TASK_BINDING_MISMATCH");
    expect(arm).toContain("RUNTIME_GIT_WORKTREE_NOT_CLEAN");
    expect(preflight).toContain("RUNTIME_GIT_WORKTREE_NOT_CLEAN");
    expect(arm).toContain('requiredArg("--usage-asset-root")');
    expect(preflight).toContain("verifyFirstOperationMaterializationEligibility");
    expect(install).toContain("daily69:first-day:preflight");
    expect(install.indexOf("daily69:first-day:preflight")).toBeLessThan(install.indexOf("Register-ScheduledTask"));
    expect(finalizer).toContain("RUNTIME_GIT_WORKTREE_NOT_CLEAN");
    expect(install).toContain("$names[1..4]");
    expect(arm).toContain('resolve(operationBase, ".locks", `${namespace}.lock`)');
    expect(recovery).toContain('join(operationBase, ".locks", `${targetNamespace}.lock`)');
    expect(common).toContain('$env:SAFE_TO_UPLOAD = "false"');
    expect(common).not.toMatch(/(?:YOUTUBE_AUTO_UPLOAD|TIKTOK_AUTO_POST|THREADS_AUTO_POST)\s*=\s*["']true["']/iu);
  });

  it("checks materialization before any Sheets projection call", async () => {
    const cutover = await readFile("scripts/daily69-first-operation/cutover.ts", "utf8");
    expect(cutover.indexOf("verifyFirstOperationMaterializationEligibility")).toBeLessThan(cutover.indexOf("projectAppendOnly"));
  });

  it("keeps day-two execution out of the closeout wrapper", async () => {
    const closeout = await readFile("scripts/daily69-first-operation/run-closeout-no-upload.ps1", "utf8");
    expect(closeout).toContain("Disable-ScheduledTask");
    expect(closeout).not.toContain("Enable-ScheduledTask");
    expect(closeout).not.toContain("run-nightly-scout");
  });

  it("keeps readiness preparation and arm gates outside external mutation paths", async () => {
    const readiness = await readFile("src/lib/affiliate-readiness/index.ts", "utf8");
    const firstOperation = await readFile("src/lib/daily69-first-operation/index.ts", "utf8");
    const videoExecutor = await readFile("src/lib/queue-scheduler/videoExecutor.ts", "utf8");
    expect(readiness).not.toMatch(/\b(?:fetch|spawn|execFile|Register-ScheduledTask|Enable-ScheduledTask|videos\.insert)\b/u);
    expect(firstOperation.indexOf("const affiliateReadiness = assertSource(source)")).toBeLessThan(firstOperation.indexOf("await mkdir(resolve(input.operationBase)"));
    expect(videoExecutor).not.toMatch(/youtubeUploadAdapter|TikTok|Threads|videos\.insert/u);
    expect([readiness, firstOperation, videoExecutor].join("\n")).not.toContain("operation-2026-08-11");
  });

  it("binds derived-source and operation publication to the exact admitted bytes", async () => {
    const builder = await readFile("scripts/daily69-first-operation/build-operational-reserve-source.ts", "utf8");
    const firstOperation = await readFile("src/lib/daily69-first-operation/index.ts", "utf8");
    expect(builder).toContain("snapshotDirectoryFiles(sourceRoot)");
    expect(builder).toContain("sha256(evidencePoolBytes)");
    expect(builder).toContain("writeFile(join(staging, name), bytes, { flag: \"wx\" })");
    expect(builder).not.toContain("copyFile(");
    expect(firstOperation).toContain("assertLoadedSourceFileHashes(source.loadedFileHashes, before.fileHashes)");
    expect(firstOperation).toContain("SOURCE_PROOF_MUTATED_BEFORE_CLONE");
    expect(firstOperation).toContain('atomicWriteJson(join(operationRoot, "selected-registry.json"), source.registry)');
    expect(firstOperation).not.toContain('copyFile(join(sourceRoot, "selected-registry.json")');
  });

  it("keeps immutable operation binding separate from direct-review freshness and external writers", async () => {
    const direct = await readFile("src/lib/queue-scheduler/codexReviewEvidence.ts", "utf8");
    const binding = await readFile("src/lib/queue-scheduler/immutableReviewBinding.ts", "utf8");
    const planner = await readFile("scripts/daily69-first-operation/plan-immutable-review-bindings.ts", "utf8");
    const apply = await readFile("scripts/daily69-first-operation/apply-immutable-review-bindings.ts", "utf8");
    expect(direct).toContain('evidence.reviewProvenance === "carry_forward_revalidation" ? 60 * 60_000 : 5 * 60_000');
    expect(binding).toContain("originReviewedAt");
    expect(binding).toContain("boundToOperationAt");
    expect(binding).not.toMatch(/\breviewedAt\s*:/u);
    expect(binding).toContain("assertCodexExecutorReceipt");
    expect(binding).toContain("originRegistrySha256");
    expect(binding).toContain("currentBusinessEligibilityDigest");
    expect([binding, planner, apply].join("\n")).not.toMatch(/executeAuthenticatedCodexReview|ffmpeg|videos\.insert|GOOGLE_SHEETS_WRITE\s*:\s*1|DRIVE_WRITE\s*:\s*1/u);
  });
});
