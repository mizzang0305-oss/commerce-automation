import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];
const commonPath = resolve("scripts/daily69-first-operation/common-first-operation-no-upload.ps1");
const wrappers = [
  "scripts/daily69-first-operation/common-first-operation-no-upload.ps1",
  "scripts/daily69-first-operation/run-control-no-upload.ps1",
  "scripts/daily69-first-operation/run-batch-no-upload.ps1",
  "scripts/daily69-first-operation/run-closeout-no-upload.ps1",
  "scripts/daily69-first-operation/run-finalizer-no-upload.ps1",
];

afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("Daily69 retained invocation evidence", () => {
  it("maps control no-op, safe failure, unexpected output, and binding guards deterministically", () => {
    const value = runPowerShell(`
$noop = Resolve-Daily69ControlOutcome -ChildExitCode 0 -Lines @('{"event":"no_pending_control_command"}')
$failure = Resolve-Daily69ControlOutcome -ChildExitCode 1 -Lines @('{"event":"control_runner_failed","safeError":"CONTROL_RUNNER_FAILED"}')
$unexpected = Resolve-Daily69ControlOutcome -ChildExitCode 0 -Lines @('not-json')
$head = Resolve-Daily69FailureOutcome -SafeCode 'RUNTIME_GIT_HEAD_MISMATCH'
$namespaceGuard = Resolve-Daily69FailureOutcome -SafeCode 'FIRST_OPERATION_NAMESPACE_MISMATCH'
$revision = Resolve-Daily69FailureOutcome -SafeCode 'LOCAL_REVISION_MISMATCH'
$pending = Get-Daily69CompletionFromOutput -Lines @('{"completion":"PENDING"}')
[ordered]@{ noop=$noop; failure=$failure; unexpected=$unexpected; head=$head; namespace=$namespaceGuard; revision=$revision; pending=$pending } | ConvertTo-Json -Depth 6 -Compress
`);
    expect(value).toMatchObject({
      noop: { outcome: "noop", wrapperExitCode: 0 },
      failure: { outcome: "failed", wrapperExitCode: 4 },
      unexpected: { outcome: "unexpected_exception", wrapperExitCode: 5 },
      head: { outcome: "guard_blocked", wrapperExitCode: 3 },
      namespace: { outcome: "guard_blocked", wrapperExitCode: 3 },
      revision: { outcome: "guard_blocked", wrapperExitCode: 3 },
      pending: "PENDING",
    });
  });

  it("redacts common credential shapes without retaining secret values", () => {
    const value = runPowerShell(`
$safe = Protect-Daily69Text -Value '{"Authorization":"Bearer top-secret","api_key":"abc123","password":"hunter2","access_token":"tkn-999","client_secret":"session-secret"}'
$escaped = Protect-Daily69Text -Value '{\"token\":\"nested-token\",\"private_key\":\"nested-key\",\"Authorization\":\"Bearer nested-auth\"}'
[ordered]@{ safe=$safe; escaped=$escaped } | ConvertTo-Json -Compress
`);
    expect(value.safe).toContain("[REDACTED]");
    expect(value.safe).not.toMatch(/top-secret|abc123|hunter2|tkn-999|session-secret/u);
    expect(value.escaped).toContain("[REDACTED]");
    expect(value.escaped).not.toMatch(/nested-token|nested-key|nested-auth/u);
  });

  it("retains only the bounded run and queue identity needed for batch reconciliation", () => {
    const value = runPowerShell<{
      counters: Record<string, number>;
      record: { event: string; status: string; run: { runId: string; claimed: number }; results: Array<{ queueId: string }> };
      serialized: string;
    }>(`
$line = '{"schemaVersion":"daily69-retained-batch-result-v1","event":"queue_batch_complete","run":{"runId":"batch-20990101040000","status":"success","claimed":3,"completed":3,"blocked":0,"failed":0,"retried":0},"results":[{"queueId":"queue-001","productKey":"secret-product","finalVideo":"C:\\\\private\\\\video.mp4"},{"queueId":"queue-002"},{"queueId":"../unsafe"}],"Authorization":"Bearer should-not-survive"}'
$record = ConvertTo-Daily69SanitizedBatchRecord -Line $line
$counters = Get-Daily69CountersFromOutput -Lines @($line)
[ordered]@{ counters=$counters; record=$record; serialized=($record | ConvertTo-Json -Depth 6 -Compress) } | ConvertTo-Json -Depth 8 -Compress
`);
    expect(value.counters).toEqual({ claimed: 3, completed: 3, failed: 0, retried: 0 });
    expect(value.record).toMatchObject({
      schemaVersion: "daily69-retained-batch-result-v1",
      event: "queue_batch_complete",
      status: "success",
      run: { runId: "batch-20990101040000", claimed: 3 },
      results: [{ queueId: "queue-001" }, { queueId: "queue-002" }],
    });
    expect(value.serialized).not.toMatch(/secret-product|private|Authorization|should-not-survive/u);
  });

  it("captures real native UTF-8 stdout explicitly even when the parent console uses CP949", () => {
    const value = runPowerShell<{
      exitCode: number;
      stdoutEncoding: string;
      record: { event: string; run: { runId: string }; results: Array<{ queueId: string }> };
    }>(`
$prior = [Console]::OutputEncoding
try {
  [Console]::OutputEncoding = [Text.Encoding]::GetEncoding(949)
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $args = '-e "process.stdout.write(JSON.stringify({schemaVersion:\\"daily69-retained-batch-result-v1\\",event:\\"queue_batch_complete\\",run:{runId:\\"batch-20260903070003\\",status:\\"success\\",claimed:1,completed:1,blocked:0,failed:0,retried:0},results:[{queueId:\\"queue-001\\",productName:\\"한글 상품\\"}]}))"'
  $capture = Invoke-Daily69Utf8Process -FilePath $node -Arguments $args -WorkingDirectory '${ps(resolve("."))}'
  $record = Select-Daily69SanitizedBatchRecord -Lines $capture.combinedLines
  [ordered]@{ exitCode=$capture.exitCode; stdoutEncoding=$capture.stdoutEncoding; record=$record } | ConvertTo-Json -Depth 8 -Compress
} finally { [Console]::OutputEncoding = $prior }
`);
    expect(value).toMatchObject({
      exitCode: 0,
      stdoutEncoding: "utf-8",
      record: { event: "queue_batch_complete", run: { runId: "batch-20260903070003" }, results: [{ queueId: "queue-001" }] },
    });
  });

  it("selects one terminal producer event amid noise and emits parseable errors without fabricated counters", () => {
    const value = runPowerShell<{
      noisy: { event: string; claimed: number };
      invalid: { event: string; safeError: string; claimed: number; results: unknown[] };
      ambiguous: { event: string; safeError: string; claimed: number };
      contract: { event: string; safeError: string; claimed: number };
      roundTrips: boolean;
    }>(`
$valid = '{"schemaVersion":"daily69-retained-batch-result-v1","event":"queue_batch_complete","run":{"runId":"batch-20260903080003","status":"success","claimed":1,"completed":1,"blocked":0,"failed":0,"retried":0},"results":[{"queueId":"queue-001"}]}'
$noisy = Select-Daily69SanitizedBatchRecord -Lines @('npm warning', (([char]0xFEFF) + $valid), 'stderr noise')
$invalid = Select-Daily69SanitizedBatchRecord -Lines @('{"event":')
$ambiguous = Select-Daily69SanitizedBatchRecord -Lines @($valid, $valid)
$contract = Select-Daily69SanitizedBatchRecord -Lines @($valid.Replace('"claimed":1','"claimed":2'))
$roundTrips = @($noisy,$invalid,$ambiguous,$contract | ForEach-Object { ($_ | ConvertTo-Json -Depth 8 -Compress | ConvertFrom-Json -ErrorAction Stop).schemaVersion -eq 'daily69-retained-batch-result-v1' }) -notcontains $false
[ordered]@{ noisy=$noisy; invalid=$invalid; ambiguous=$ambiguous; contract=$contract; roundTrips=$roundTrips } | ConvertTo-Json -Depth 8 -Compress
`);
    expect(value.noisy).toMatchObject({ event: "queue_batch_complete", claimed: 1 });
    expect(value.invalid).toMatchObject({ event: "evidence_capture_error", safeError: "RAW_BATCH_RESULT_UNPARSEABLE", claimed: 0, results: [] });
    expect(value.ambiguous).toMatchObject({ event: "evidence_capture_error", safeError: "RAW_BATCH_RESULT_AMBIGUOUS", claimed: 0 });
    expect(value.contract).toMatchObject({ event: "evidence_capture_error", safeError: "RAW_BATCH_RESULT_CONTRACT_INVALID", claimed: 0 });
    expect(value.roundTrips).toBe(true);
  });

  it("creates an append-only trace and one scanner-compatible final receipt with unproven task correlation", async () => {
    const root = await tempRoot();
    const namespace = "operation-2026-08-30-attempt-2";
    const value = runPowerShell<{ receipt: string; trace: string }>(`
Initialize-Daily69InvocationEvidence -ResolvedQueue '${ps(root)}' -Role control -Name 'Minz-Commerce-ControlRunner-NoUpload-V1' -BoundNamespace '${namespace}' -ExpectedHead '${"a".repeat(40)}' -ActualHead '${"a".repeat(40)}' -BoundWrapper '${ps(commonPath)}'
Complete-Daily69InvocationEvidence -Outcome success -ChildExitCode 0 -WrapperExitCode 0 -SafeError '' -Claimed 1 -Completed 1
[ordered]@{ receipt=$script:Daily69InvocationReceiptPath; trace=$script:Daily69InvocationEvidencePath } | ConvertTo-Json -Compress
`);
    const receipt = JSON.parse(await readFile(value.receipt, "utf8"));
    const traceLines = (await readFile(value.trace, "utf8")).trim().split(/\r?\n/u).map((line) => JSON.parse(line));
    expect(receipt).toMatchObject({
      schemaVersion: "daily69-retained-execution-v1",
      role: "control",
      runId: expect.any(String),
      namespace,
      operationNamespace: namespace,
      operationDate: "2026-08-30",
      expectedGitHead: "a".repeat(40),
      taskName: "Minz-Commerce-ControlRunner-NoUpload-V1",
      exitCode: 0,
      origin: "UNKNOWN",
      taskEvent: { correlated: false, startedEventId: 0, completedEventId: 0 },
      claimed: 1,
      completed: 1,
      SAFE_TO_UPLOAD: false,
      PLATFORM_UPLOAD: 0,
      secretRedacted: true,
    });
    expect(receipt.invocationId).toMatch(/^[A-Za-z0-9_-]{8,128}$/u);
    expect(Number.isFinite(Date.parse(receipt.startedAt))).toBe(true);
    expect(Number.isFinite(Date.parse(receipt.startedAtKst))).toBe(true);
    expect(Number.isFinite(Date.parse(receipt.completedAt))).toBe(true);
    expect(Number.isFinite(Date.parse(receipt.finishedAtKst))).toBe(true);
    expect(traceLines.map((line) => line.event)).toEqual(["invocation_started", "invocation_finished"]);
    expect((await readdir(join(root, "retained-execution", "control"))).filter((name) => /\.(?:json|jsonl)$/u.test(name))).toEqual([`${receipt.invocationId}.json`]);
  });

  it("claims exactly one batch invocation for a real KST hour and no-ops catch-up or drain-window attempts", async () => {
    const root = await tempRoot();
    const namespace = "operation-2026-08-30";
    await writeFile(join(root, "operation-manifest.json"), `${JSON.stringify({ namespace, operationDate: "2026-08-30" })}\n`);
    const value = runPowerShell(`
$script:Daily69InvocationId = 'batch-slot-test-123'
$first = Claim-Daily69BatchSlot -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -NowKst ([DateTimeOffset]'2026-08-30T04:10:00+09:00')
$second = Claim-Daily69BatchSlot -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -NowKst ([DateTimeOffset]'2026-08-30T04:59:59+09:00')
$before = Test-Daily69NewWorkWindow -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -Role batch -NowKst ([DateTimeOffset]'2026-08-30T03:59:59+09:00')
$last = Test-Daily69NewWorkWindow -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -Role batch -NowKst ([DateTimeOffset]'2026-08-30T23:49:59+09:00')
$drain = Test-Daily69NewWorkWindow -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -Role batch -NowKst ([DateTimeOffset]'2026-08-30T23:50:00+09:00')
$wrongDate = Test-Daily69NewWorkWindow -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -Role control -NowKst ([DateTimeOffset]'2026-08-31T04:00:00+09:00')
$controlBefore = Test-Daily69NewWorkWindow -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -Role control -NowKst ([DateTimeOffset]'2026-08-30T00:00:59+09:00')
$controlStart = Test-Daily69NewWorkWindow -ResolvedQueue '${ps(root)}' -BoundNamespace '${namespace}' -Role control -NowKst ([DateTimeOffset]'2026-08-30T00:01:00+09:00')
[ordered]@{ first=$first; second=$second; before=$before; last=$last; drain=$drain; wrongDate=$wrongDate; controlBefore=$controlBefore; controlStart=$controlStart } | ConvertTo-Json -Depth 5 -Compress
`);
    expect(value.first).toMatchObject({ claimed: true, slot: "2026-08-30-04" });
    expect(value.second).toMatchObject({ claimed: false, safeCode: "BATCH_SLOT_ALREADY_CLAIMED", slot: "2026-08-30-04" });
    expect(value.before).toMatchObject({ allowed: false, safeCode: "BATCH_OPERATION_WINDOW_CLOSED" });
    expect(value.last).toMatchObject({ allowed: true });
    expect(value.drain).toMatchObject({ allowed: false, safeCode: "OPERATION_DRAIN_WINDOW_NOOP" });
    expect(value.wrongDate).toMatchObject({ allowed: false, safeCode: "FIRST_OPERATION_DATE_NOT_ACTIVE" });
    expect(value.controlBefore).toMatchObject({ allowed: false, safeCode: "CONTROL_OPERATION_WINDOW_CLOSED" });
    expect(value.controlStart).toMatchObject({ allowed: true });
    const claim = JSON.parse(await readFile(join(root, "retained-execution", "batch-slots", "2026-08-30-04.json"), "utf8"));
    expect(claim).toMatchObject({ schemaVersion: "daily69-batch-slot-claim-v1", invocationId: "batch-slot-test-123", SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 });
  });

  it("blocks closeout when a mutation lock or unresolved lease exists", async () => {
    const root = await tempRoot();
    await writeFile(join(root, "queue.json"), "[]\n");
    const idle = runPowerShell(`Test-Daily69CloseoutIdle -ResolvedQueue '${ps(root)}' | ConvertTo-Json -Compress`);
    await writeFile(join(root, "runner.lock"), "held\n");
    const locked = runPowerShell(`Test-Daily69CloseoutIdle -ResolvedQueue '${ps(root)}' | ConvertTo-Json -Compress`);
    await unlink(join(root, "runner.lock"));
    await writeFile(join(root, "queue.json"), '[{"leaseOwner":"runner-1","leaseExpiresAt":"2026-08-30T15:00:00.000Z"}]\n');
    const leased = runPowerShell(`Test-Daily69CloseoutIdle -ResolvedQueue '${ps(root)}' | ConvertTo-Json -Compress`);
    expect(idle).toMatchObject({ idle: true, unresolvedLeases: 0 });
    expect(locked).toMatchObject({ idle: false, safeCode: "FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK" });
    expect(leased).toMatchObject({ idle: false, safeCode: "FIRST_OPERATION_CLOSEOUT_PENDING_ACTIVE_WORK", unresolvedLeases: 1 });
  });

  it("keeps the repair scoped to wrappers and avoids Write-Error masking", async () => {
    const contents = await Promise.all(wrappers.map((path) => readFile(path, "utf8")));
    expect(contents.join("\n")).not.toContain("Write-Error");
    expect(contents[0]).toContain("daily69-retained-execution-v1");
    expect(contents[0]).toContain("correlated = $false");
    expect(contents[1]).toContain("Resolve-Daily69ControlOutcome");
    expect(contents[2]).toContain("Claim-Daily69BatchSlot");
    expect(contents[0]).toContain("RAW_BATCH_RESULT_UNPARSEABLE");
    expect(contents[0]).toContain("StandardOutputEncoding");
    expect(contents[2]).toContain("Select-Daily69SanitizedBatchRecord");
    expect(contents[0]).toContain("BATCH_SLOT_ALREADY_CLAIMED");
    expect(contents[3].indexOf("Test-Daily69CloseoutIdle")).toBeLessThan(contents[3].indexOf("Disable-ScheduledTask"));
    expect(contents[3]).toContain("queue-control:project");
    expect(contents[3]).toContain("PENDING_FINALIZER");
    expect(contents[3]).not.toContain("daily69:first-day:closeout");
    expect(contents[3]).toContain("$resolution.wrapperExitCode -ge 3");
    expect(contents[4]).toContain("daily69:first-day:finalize-natural-closeout");
  });
});

function runPowerShell<T extends Record<string, unknown> = Record<string, unknown>>(body: string): T {
  const prefix = `. '${ps(commonPath)}' -WorktreeRoot 'library-only' -QueueRoot 'library-only' -Namespace 'operation-2026-08-30' -SourceRoot 'library-only' -ExpectedGitHead '${"a".repeat(40)}' -EnvFile 'library-only' -InvocationRole control -TaskName 'LibraryOnly' -WrapperPath '${ps(commonPath)}' -LibraryOnly`;
  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", `${prefix}\n${body}`], {
    cwd: process.cwd(), encoding: "utf8", windowsHide: true,
  }).trim();
  return JSON.parse(output) as T;
}

async function tempRoot() {
  const root = await mkdtemp(join(tmpdir(), "daily69-retained-"));
  roots.push(root);
  return root;
}

function ps(value: string) { return value.split("'").join("''"); }
