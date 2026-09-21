import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

export const CODEX_CLI_STDOUT_CAPTURE_BYTES = 2_000_000;
export const CODEX_CLI_STDERR_CAPTURE_BYTES = 16_384;
export const CODEX_CLI_EXCERPT_BYTES = 1_024;

export type CapturedCliProcess = {
  exitCode: number | null;
  signal: string | null;
  processId: number | null;
  processErrorCode: string;
  failurePhase: "exit" | "spawn" | "stdin" | "timeout";
  startedAt: string;
  completedAt: string;
  terminationConfirmed: boolean;
  stdout: string;
  stderr: string;
  stdoutByteLength: number;
  stderrByteLength: number;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutWasTruncated: boolean;
  stderrWasTruncated: boolean;
};

export type CodexCliFailureDiagnostic = Omit<CapturedCliProcess, "exitCode" | "stdout" | "stderr" | "failurePhase"> & {
  schemaVersion: "codex-cli-failure-diagnostic-v1";
  cliExitCode: number | null;
  classifiedErrorCode: string;
  codexCliVersion: string;
  resolvedExecutableFingerprint: string;
  failurePhase: CapturedCliProcess["failurePhase"] | "structured_output";
  failureFingerprint: string;
  safeFailureSignals: string[];
  sanitizedStderrExcerpt?: string;
  sanitizedStdoutExcerpt?: string;
};

export class CodexCliInvocationError extends Error {
  constructor(readonly diagnostic: CodexCliFailureDiagnostic) {
    super(diagnostic.classifiedErrorCode);
    this.name = "CodexCliInvocationError";
  }
}

// Never persist arbitrary output text. These static phrases are the entire
// excerpt vocabulary; unknown provider/prompt/product text is deliberately lost.
// Only the upgrade signal extends the legacy classifier, based on live repro.
export function safeCliExcerpt(value: string): string {
  const rules: Array<[RegExp, string]> = [
    [/model.{0,100}requires a newer version of Codex/iu, "MODEL_REQUIRES_NEWER_CODEX"],
    [/not logged in|authentication|unauthorized|forbidden/iu, "AUTHENTICATION_ERROR_REPORTED"],
    [/rate.?limit|usage.?limit|quota|credit/iu, "USAGE_OR_RATE_LIMIT_REPORTED"],
    [/schema/iu, "SCHEMA_ERROR_REPORTED"],
    [/image|file.*not found|no such file/iu, "IMAGE_OR_FILE_ERROR_REPORTED"],
  ];
  return rules.filter(([pattern]) => pattern.test(value)).map(([, text]) => text).join("; ").slice(0, CODEX_CLI_EXCERPT_BYTES)
    || "UNCLASSIFIED_OUTPUT_OMITTED";
}

export function cliInvocationError(input: {
  process: CapturedCliProcess;
  classifiedErrorCode: string;
  cliVersion: string;
  executableFingerprint: string;
  phase?: CodexCliFailureDiagnostic["failurePhase"];
}): CodexCliInvocationError {
  const p = input.process;
  const code = /^CODEX_REVIEW_[A-Z0-9_]+$/u.test(input.classifiedErrorCode) ? input.classifiedErrorCode : "CODEX_REVIEW_CLI_EXIT_NONZERO";
  const version = /^\d+\.\d+\.\d+$/u.test(input.cliVersion) ? input.cliVersion : "unavailable";
  const fingerprint = /^[a-f0-9]{64}$/u.test(input.executableFingerprint) ? input.executableFingerprint : hash("unavailable");
  const stdout = safeCliExcerpt(p.stdout), stderr = safeCliExcerpt(p.stderr);
  const safeFailureSignals = [...new Set([stdout, stderr].flatMap(value => value.split("; ")))].sort();
  return new CodexCliInvocationError({
    schemaVersion: "codex-cli-failure-diagnostic-v1",
    cliExitCode: p.exitCode, classifiedErrorCode: code, codexCliVersion: version,
    resolvedExecutableFingerprint: fingerprint, failurePhase: input.phase ?? p.failurePhase,
    processId: p.processId, processErrorCode: p.processErrorCode, signal: p.signal,
    startedAt: p.startedAt, completedAt: p.completedAt, terminationConfirmed: p.terminationConfirmed,
    stdoutByteLength: p.stdoutByteLength, stderrByteLength: p.stderrByteLength,
    stdoutSha256: p.stdoutSha256, stderrSha256: p.stderrSha256,
    stdoutWasTruncated: p.stdoutWasTruncated, stderrWasTruncated: p.stderrWasTruncated,
    safeFailureSignals, sanitizedStdoutExcerpt: stdout, sanitizedStderrExcerpt: stderr,
    failureFingerprint: hash(JSON.stringify({ code, version, fingerprint, phase: input.phase ?? p.failurePhase,
      ...(code === "CODEX_REVIEW_CLI_EXIT_NONZERO" ? { stdoutSha256: p.stdoutSha256, stderrSha256: p.stderrSha256 } : {}) })),
  });
}

export function receiptCliDiagnostic(error: CodexCliInvocationError, diagnosticProvenance: boolean): CodexCliFailureDiagnostic {
  const d = error.diagnostic;
  // Pick fields explicitly; never spread an exception or attach raw cause/output.
  return {
    schemaVersion: d.schemaVersion, cliExitCode: d.cliExitCode, classifiedErrorCode: d.classifiedErrorCode,
    codexCliVersion: d.codexCliVersion, resolvedExecutableFingerprint: d.resolvedExecutableFingerprint,
    failurePhase: d.failurePhase, failureFingerprint: d.failureFingerprint,
    processId: d.processId, processErrorCode: d.processErrorCode, signal: d.signal,
    startedAt: d.startedAt, completedAt: d.completedAt, terminationConfirmed: d.terminationConfirmed,
    stdoutByteLength: d.stdoutByteLength, stderrByteLength: d.stderrByteLength,
    stdoutSha256: d.stdoutSha256, stderrSha256: d.stderrSha256,
    stdoutWasTruncated: d.stdoutWasTruncated, stderrWasTruncated: d.stderrWasTruncated,
    safeFailureSignals: d.safeFailureSignals,
    ...(diagnosticProvenance ? { sanitizedStderrExcerpt: d.sanitizedStderrExcerpt, sanitizedStdoutExcerpt: d.sanitizedStdoutExcerpt } : {}),
  };
}

export function captureCliProcess(input: {
  command: string; args: string[]; env: NodeJS.ProcessEnv; cwd: string; timeoutMs: number; stdin: string;
}): Promise<CapturedCliProcess> {
  return new Promise(resolve => {
    const startedAt = new Date().toISOString();
    const child = spawn(input.command, input.args, { cwd: input.cwd, env: input.env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const streams = {
      stdout: { hash: createHash("sha256"), bytes: 0, kept: 0, cap: CODEX_CLI_STDOUT_CAPTURE_BYTES, chunks: [] as Buffer[] },
      stderr: { hash: createHash("sha256"), bytes: 0, kept: 0, cap: CODEX_CLI_STDERR_CAPTURE_BYTES, chunks: [] as Buffer[] },
    };
    let phase: CapturedCliProcess["failurePhase"] = "exit", processErrorCode = "", settled = false;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (exitCode: number | null, signal: string | null, terminationConfirmed: boolean) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(terminationTimer);
      const out = streams.stdout, err = streams.stderr;
      resolve({ exitCode, signal, processId: child.pid ?? null, processErrorCode, failurePhase: phase, startedAt,
        completedAt: new Date().toISOString(), terminationConfirmed,
        stdout: Buffer.concat(out.chunks).toString("utf8"), stderr: Buffer.concat(err.chunks).toString("utf8"),
        stdoutByteLength: out.bytes, stderrByteLength: err.bytes, stdoutSha256: out.hash.digest("hex"), stderrSha256: err.hash.digest("hex"),
        stdoutWasTruncated: out.bytes > out.kept, stderrWasTruncated: err.bytes > err.kept });
    };
    const stopOwnedProcess = () => {
      if (process.platform === "win32" && child.pid) {
        const killer = spawn(join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"), ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", () => { child.kill(); });
      } else child.kill("SIGKILL");
      terminationTimer = setTimeout(() => finish(null, null, false), 5_000);
    };
    const timer = setTimeout(() => { phase = "timeout"; stopOwnedProcess(); }, input.timeoutMs);
    for (const name of ["stdout", "stderr"] as const) child[name].on("data", (chunk: Buffer) => {
      if (settled) return;
      const s = streams[name]; s.hash.update(chunk); s.bytes += chunk.length;
      const keep = Math.min(chunk.length, s.cap - s.kept);
      if (keep > 0) { s.chunks.push(Buffer.from(chunk.subarray(0, keep))); s.kept += keep; }
    });
    child.stdin.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EPIPE" || settled) return;
      phase = "stdin"; processErrorCode = safeProcessCode(error.code); stopOwnedProcess();
    });
    child.once("error", (error: NodeJS.ErrnoException) => {
      phase = "spawn"; processErrorCode = safeProcessCode(error.code); finish(null, null, true);
    });
    child.once("close", (code, signal) => finish(code, signal, true));
    child.stdin.end(input.stdin, "utf8");
  });
}

function safeProcessCode(value: unknown) { return typeof value === "string" && /^[A-Z0-9_]{1,40}$/u.test(value) ? value : "PROCESS_ERROR"; }
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
