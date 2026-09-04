import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DAILY69_TIMING, getDaily69Timing, isDaily69CloseoutWindow } from "../../src/lib/daily69-first-operation/timing";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Daily69 timing and bounded idle contract", () => {
  it("strictly separates a full 55-minute batch and full 30-minute closeout by their margins", () => {
    const timing = getDaily69Timing("2026-09-05");
    expect(timing.lastBatchAt.toISOString()).toBe("2026-09-05T14:00:00.000Z");
    expect(timing.batchDeadline.toISOString()).toBe("2026-09-05T14:55:00.000Z");
    expect(timing.closeoutAt.toISOString()).toBe("2026-09-05T15:15:00.000Z");
    expect(timing.finalizerAt.toISOString()).toBe("2026-09-05T16:05:00.000Z");
    expect(+timing.closeoutAt).toBeGreaterThan(+timing.batchDeadline + DAILY69_TIMING.postBatchSafetyMarginMinutes * 60_000);
    expect(+timing.finalizerAt).toBeGreaterThan(+timing.closeoutDeadline + DAILY69_TIMING.postCloseoutSafetyMarginMinutes * 60_000);
    expect(DAILY69_TIMING.idleGraceSeconds).toBeLessThan(DAILY69_TIMING.closeoutExecutionLimitMinutes * 60);
  });

  it("admits only the bounded next-day closeout window, not operation-day or Finalizer time", () => {
    expect(isDaily69CloseoutWindow("2026-09-05", new Date("2026-09-06T00:15:00+09:00"))).toBe(true);
    for (const value of ["2026-09-05T23:55:00+09:00", "2026-09-06T00:14:59+09:00", "2026-09-06T00:45:00+09:00", "2026-09-06T01:05:00+09:00"]) {
      expect(isDaily69CloseoutWindow("2026-09-05", new Date(value))).toBe(false);
    }
    expect(() => getDaily69Timing("2026-02-30")).toThrow("TIMING_DATE_INVALID");
  });

  it("computes the same canonical dates in the actual Windows PowerShell runtime", () => {
    const value = ps(`$t=Get-Daily69Timing -OperationDate '2026-09-05'; [ordered]@{ closeout=$t.closeoutAt.ToString('yyyy-MM-ddTHH:mm:ss'); finalizer=$t.finalizerAt.ToString('yyyy-MM-ddTHH:mm:ss'); batchLimit=$t.contract.batchExecutionLimitMinutes; closeoutLimit=$t.contract.closeoutExecutionLimitMinutes } | ConvertTo-Json -Compress`);
    expect(value).toEqual({ closeout: "2026-09-06T00:15:00", finalizer: "2026-09-06T01:05:00", batchLimit: 55, closeoutLimit: 30 });
  });

  it("normalizes 69 empty lease objects in PowerShell 5.1 and retains exact receipt counts", async () => {
    const root = await fixture();
    const queuePath = join(root, "queue.json");
    await writeFile(queuePath, JSON.stringify(Array.from({ length: 69 }, () => ({ status: "video_ready_autoqa", leaseOwner: "", leaseExpiresAt: "" }))));
    await writeFile(join(root, "control-state.json"), JSON.stringify({ localRevision: 180, projectionRevision: 180 }));
    const before = await readFile(queuePath, "utf8");
    const value = ps(`
$root='${quote(root)}'
$items=@(Read-Daily69QueueItems -Path (Join-Path $root 'queue.json'))
$idle=Test-Daily69CloseoutIdle -ResolvedQueue $root
Initialize-Daily69InvocationEvidence -ResolvedQueue $root -Role closeout -Name 'LibraryOnly' -BoundNamespace operation-2026-09-05 -ExpectedHead '${"a".repeat(40)}' -ActualHead '${"a".repeat(40)}' -BoundWrapper '${quote(resolve("scripts/daily69-first-operation/run-closeout-no-upload.ps1"))}'
Complete-Daily69InvocationEvidence -Outcome success -ChildExitCode 0 -WrapperExitCode 0 -SafeError ''
$receipt=Get-Content -LiteralPath $script:Daily69InvocationReceiptPath -Raw | ConvertFrom-Json
[ordered]@{ count=$items.Count; idle=$idle.idle; leases=$idle.unresolvedLeases; ready=$receipt.readyCount } | ConvertTo-Json -Compress`);
    expect(value).toEqual({ count: 69, idle: true, leases: 0, ready: 69 });
    expect(await readFile(queuePath, "utf8")).toBe(before);
  });

  it("handles delayed idle, fails closed after bounded grace, and emits only structured observations", () => {
    const value = ps(`
$script:observations=@()
function Write-Daily69EvidenceLine { param($Data) $script:observations += [pscustomobject]$Data }
$script:probeCount=0
$probe={ param($queue) $script:probeCount++; [pscustomobject]@{ idle=($script:probeCount -ge 3); safeCode=if($script:probeCount -ge 3){''}else{'FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK'}; unresolvedLeases=if($script:probeCount -ge 3){0}else{1}; presentLocks=@(); processingCount=0 } }
$delayed=Wait-Daily69CloseoutIdle -ResolvedQueue unused -MaximumWaitSeconds 10 -PollIntervalSeconds 5 -IdleProbe $probe -Sleep { param($seconds) }
$active={ param($queue) [pscustomobject]@{idle=$false;safeCode='FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK';unresolvedLeases=1;presentLocks=@();processingCount=1} }
$timeout=Wait-Daily69CloseoutIdle -ResolvedQueue unused -MaximumWaitSeconds 10 -PollIntervalSeconds 5 -IdleProbe $active -Sleep { param($seconds) }
$ready={ param($queue) [pscustomobject]@{idle=$true;safeCode='';unresolvedLeases=0;presentLocks=@();processingCount=0} }
$immediate=Wait-Daily69CloseoutIdle -ResolvedQueue unused -MaximumWaitSeconds 10 -PollIntervalSeconds 5 -IdleProbe $ready -Sleep {throw 'MUST_NOT_SLEEP'}
[ordered]@{delayed=$delayed;timeout=$timeout;immediate=$immediate;observations=$script:observations} | ConvertTo-Json -Depth 7 -Compress`);
    expect(value.delayed).toMatchObject({ idle: true, checks: 3, timedOut: false });
    expect(value.timeout).toMatchObject({ idle: false, safeCode: "FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK", checks: 3, timedOut: true });
    expect(value.immediate).toMatchObject({ idle: true, checks: 1, timedOut: false });
    expect(value.observations).toHaveLength(7);
    expect(JSON.stringify(value.observations)).not.toMatch(/productName|leaseOwner|queuePath/u);
  });

  it("fails closed for malformed queue, missing queue, and processing without a lease", async () => {
    const root = await fixture();
    const missing = ps(`Test-Daily69CloseoutIdle -ResolvedQueue '${quote(root)}' | ConvertTo-Json -Compress`);
    expect(missing).toMatchObject({ idle: false, safeCode: "FIRST_OPERATION_QUEUE_INVALID" });
    await writeFile(join(root, "queue.json"), "{}");
    const malformed = ps(`Test-Daily69CloseoutIdle -ResolvedQueue '${quote(root)}' | ConvertTo-Json -Compress`);
    expect(malformed).toMatchObject({ idle: false, safeCode: "FIRST_OPERATION_QUEUE_INVALID" });
    await writeFile(join(root, "queue.json"), '[{"status":"processing","leaseOwner":"","leaseExpiresAt":""}]');
    const processing = ps(`Test-Daily69CloseoutIdle -ResolvedQueue '${quote(root)}' | ConvertTo-Json -Compress`);
    expect(processing).toMatchObject({ idle: false, processingCount: 1 });
    await writeFile(join(root, "queue.json"), '[{"status":"claimed","leaseOwner":"","leaseExpiresAt":""}]');
    expect(ps(`Test-Daily69CloseoutIdle -ResolvedQueue '${quote(root)}' | ConvertTo-Json -Compress`)).toMatchObject({ idle: false, claimedCount: 1, safeCode: "FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK" });
    await writeFile(join(root, "queue.json"), '[{"status":"video_ready_autoqa","leaseOwner":"","leaseExpiresAt":""}]');
    await writeFile(join(root, "command-runner.lock"), "active");
    expect(ps(`Test-Daily69CloseoutIdle -ResolvedQueue '${quote(root)}' | ConvertTo-Json -Compress`)).toMatchObject({ idle: false, presentLocks: ["command-runner.lock"] });
  });

  it("durably retains the exact Closeout idle guard failure without changing queue bytes", async () => {
    const root=await fixture();
    const payload='[{"status":"claimed","leaseOwner":"","leaseExpiresAt":""}]';
    await writeFile(join(root,"queue.json"),payload);
    await writeFile(join(root,"control-state.json"),'{"localRevision":1,"projectionRevision":1}');
    const observed=ps(`$root='${quote(root)}'; Initialize-Daily69InvocationEvidence -ResolvedQueue $root -Role closeout -Name LibraryOnly -BoundNamespace operation-2026-09-05 -ExpectedHead '${"a".repeat(40)}' -ActualHead '${"a".repeat(40)}' -BoundWrapper '${quote(resolve("scripts/daily69-first-operation/run-closeout-no-upload.ps1"))}'; $idle=Wait-Daily69CloseoutIdle -ResolvedQueue $root -MaximumWaitSeconds 1 -PollIntervalSeconds 1 -Sleep {param($seconds)}; Complete-Daily69InvocationEvidence -Outcome guard_blocked -ChildExitCode 3 -WrapperExitCode 3 -SafeError $idle.safeCode; Get-Content -LiteralPath $script:Daily69InvocationReceiptPath -Raw`);
    expect(observed).toMatchObject({outcome:"guard_blocked",exitCode:3,safeError:"FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK"});
    expect(await readFile(join(root,"queue.json"),"utf8")).toBe(payload);
  });

  it("rechecks writer state before projection and blocks Finalizer while a prior task is running", async () => {
    const closeout = await readFile(resolve("scripts/daily69-first-operation/run-closeout-no-upload.ps1"), "utf8");
    const afterPreflight = closeout.slice(closeout.indexOf("# Preflight may take time."), closeout.indexOf("$projectionOutput ="));
    expect(afterPreflight).toContain("Test-Daily69CloseoutIdle");
    expect(afterPreflight).toContain("$priorRunning");
    expect(afterPreflight).toContain("$timing.closeoutDeadline");
    const finalizer = await readFile(resolve("scripts/daily69-first-operation/run-finalizer-no-upload.ps1"), "utf8");
    expect(finalizer.indexOf("DAILY69_FINALIZER_PRIOR_TASK_RUNNING")).toBeLessThan(finalizer.indexOf("$capture = Invoke-Daily69FinalizerChild"));
  });
});

async function fixture() { const root = await mkdtemp(join(tmpdir(), "daily69-timing-")); roots.push(root); return root; }
function quote(value: string) { return value.split("'").join("''"); }
function ps(body: string): Record<string, unknown> {
  const prefix = `$ProgressPreference='SilentlyContinue'; . '${quote(resolve("scripts/daily69-first-operation/common-first-operation-no-upload.ps1"))}' -WorktreeRoot library -QueueRoot library -Namespace operation-2026-09-05 -SourceRoot library -ExpectedGitHead '${"a".repeat(40)}' -EnvFile library -InvocationRole closeout -TaskName LibraryOnly -WrapperPath library -LibraryOnly`;
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `${prefix}\n${body}`], { encoding: "utf8", windowsHide: true, timeout: 30_000 }).trim()) as Record<string, unknown>;
}
