import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { captureCliProcess, cliInvocationError, safeCliExcerpt, CODEX_CLI_STDOUT_CAPTURE_BYTES, CODEX_CLI_STDERR_CAPTURE_BYTES, CODEX_CLI_EXCERPT_BYTES } from "../../src/lib/queue-scheduler/codexCliDiagnostics";

const hash = (v: string) => createHash("sha256").update(v).digest("hex");
describe("bounded CLI process diagnostics", () => {
  it("hashes every output byte while keeping strict byte-bounded UTF-8 capture", async () => {
    const stdout = "가".repeat(710000), stderr = "나".repeat(7000);
    const result = await captureCliProcess({ command: process.execPath, args: ["-e", 'process.stdout.write("가".repeat(710000));process.stderr.write("나".repeat(7000));process.exitCode=3;'], cwd: tmpdir(), env: process.env, timeoutMs: 10000, stdin: "" });
    expect(result).toMatchObject({ exitCode: 3, stdoutByteLength: Buffer.byteLength(stdout), stderrByteLength: Buffer.byteLength(stderr), stdoutSha256: hash(stdout), stderrSha256: hash(stderr), stdoutWasTruncated: true, stderrWasTruncated: true, terminationConfirmed: true });
    // A split UTF-8 codepoint may decode to a 3-byte replacement; raw retained buffers are capped exactly.
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(CODEX_CLI_STDOUT_CAPTURE_BYTES + 2);
    expect(Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(CODEX_CLI_STDERR_CAPTURE_BYTES + 2);
  });

  it("makes bounded static excerpts with no raw credentials or private prompt", () => {
    const raw = 'Authorization: Bearer sk-test-secret\ntoken="raw-token"\nrefresh_token="raw-refresh"\nCookie: raw-cookie\napi_key: raw-key\nclient_secret: raw-client\npassword: raw-password\nprivate product text\n' + "x".repeat(30000);
    expect(safeCliExcerpt(raw)).toBe("UNCLASSIFIED_OUTPUT_OMITTED");
    const excerpt = safeCliExcerpt(raw + "\nThe 'gpt-6-astra' model requires a newer version of Codex. authentication warning");
    expect(excerpt).toBe("MODEL_REQUIRES_NEWER_CODEX; AUTHENTICATION_ERROR_REPORTED");
    expect(Buffer.byteLength(excerpt)).toBeLessThanOrEqual(CODEX_CLI_EXCERPT_BYTES);
    for (const value of ["sk-test", "raw-", "Authorization", "Cookie", "refresh_token", "private product"]) expect(excerpt).not.toContain(value);
  });

  it("captures launch failure without inventing process exit 1 or exposing a raw path", async () => {
    const result = await captureCliProcess({ command: "Z:/definitely-absent-codex.exe", args: [], cwd: tmpdir(), env: process.env, timeoutMs: 500, stdin: "" });
    expect(result.exitCode).toBeNull(); expect(result.failurePhase).toBe("spawn");
    const error = cliInvocationError({ process: result, classifiedErrorCode: "CODEX_REVIEW_CLI_LAUNCH_FAILED", cliVersion: "unavailable", executableFingerprint: "a".repeat(64) });
    expect(error.message).toBe("CODEX_REVIEW_CLI_LAUNCH_FAILED"); expect(JSON.stringify(error.diagnostic)).not.toContain("definitely-absent");
  });

  it("terminates only its owned timeout process and retains a terminal timeout diagnostic", async () => {
    const result = await captureCliProcess({ command: process.execPath, args: ["-e", "setInterval(()=>{},1000)"], cwd: tmpdir(), env: process.env, timeoutMs: 200, stdin: "" });
    expect(result.failurePhase).toBe("timeout"); expect(result.terminationConfirmed).toBe(true); expect(result.processId).toBeGreaterThan(0);
  });
});
