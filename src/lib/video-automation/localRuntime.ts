import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";

export class LocalJsonProcessError extends Error {
  readonly diagnostic: Record<string, unknown> | null;

  constructor(code: string, diagnostic: Record<string, unknown> | null) {
    super(code);
    this.name = "LocalJsonProcessError";
    this.diagnostic = diagnostic;
  }
}

export async function runJsonProcess(command: string, args: string[], input: unknown, timeoutMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: { ...process.env, PYTHONIOENCODING: "utf-8" }, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("LOCAL_PROCESS_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { if (stdout.length < 1_000_000) stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        try {
          const failed = JSON.parse(stdout) as { safe_error?: unknown; error_type?: unknown; diagnostic?: unknown };
          if (typeof failed.safe_error === "string" && /^[A-Z0-9_:-]+$/u.test(failed.safe_error)) {
            const suffix = typeof failed.error_type === "string" ? `:${failed.error_type.toUpperCase()}` : "";
            const diagnostic = retainSafeLocalDiagnostic(failed.diagnostic);
            return reject(new LocalJsonProcessError(`${failed.safe_error}${suffix}`, diagnostic));
          }
        } catch { /* retain the generic safe error */ }
        return reject(new Error(stderr.includes("TIMEOUT") ? "LOCAL_PROCESS_TIMEOUT" : "LOCAL_PROCESS_FAILED"));
      }
      try { const parsed = JSON.parse(stdout) as Record<string, unknown>; resolve(parsed); } catch { reject(new Error("LOCAL_PROCESS_INVALID_JSON")); }
    });
    child.stdin.end(JSON.stringify(input));
  });
}

function retainSafeLocalDiagnostic(value: unknown): Record<string, unknown> | null {
  const sanitized = sanitizeDiagnosticValue(value, 0);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized) ? sanitized as Record<string, unknown> : null;
}

function sanitizeDiagnosticValue(value: unknown, depth: number): unknown {
  if (depth > 8) return "REDACTED_DEPTH_LIMIT";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    if (/^(?:[a-z]:[\\/]|\\\\|\/)/iu.test(value)) return "REDACTED_ABSOLUTE_PATH";
    return value.slice(0, 512);
  }
  if (Array.isArray(value)) return value.slice(0, 128).map((entry) => sanitizeDiagnosticValue(entry, depth + 1));
  if (typeof value !== "object") return null;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 128).map(([key, entry]) => {
    const unsafePathField = key !== "rawAbsolutePathsStored" && /absolutePath|rawPath|fullPath/iu.test(key);
    return [
      unsafePathField ? "redactedField" : key.slice(0, 80),
      unsafePathField ? "REDACTED_PATH_FIELD" : sanitizeDiagnosticValue(entry, depth + 1),
    ];
  }));
}

export async function runFasterWhisper(input: { pythonExe: string; scriptPath: string; modelPath: string; audioPath: string; outputPath: string }): Promise<{ transcript: string }> {
  await runExitProcess(input.pythonExe, [input.scriptPath, "--input", input.audioPath, "--output-json", input.outputPath, "--language", "ko", "--model-path", input.modelPath], 900_000);
  const value = JSON.parse(await readFile(input.outputPath, "utf8")) as { transcript?: unknown };
  if (typeof value.transcript !== "string" || !value.transcript.trim()) throw new Error("ASR_TRANSCRIPT_REQUIRED");
  return { transcript: value.transcript.trim() };
}

export async function runExitProcess(command: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: { ...process.env, PYTHONIOENCODING: "utf-8" }, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("LOCAL_PROCESS_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.includes("TIMEOUT") ? "LOCAL_PROCESS_TIMEOUT" : "LOCAL_PROCESS_FAILED"));
    });
  });
}

export function koreanTextSimilarity(expected: string, actual: string): number {
  const left = normalize(expected);
  const right = normalize(actual);
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return Math.round((1 - previous[right.length] / Math.max(left.length, right.length)) * 10_000) / 10_000;
}

export function bestKoreanSubstringSimilarity(expected: string, actual: string): number {
  const target = normalize(expected);
  const source = normalize(actual);
  if (!target || !source) return 0;
  if (source.includes(target)) return 1;
  let best = 0;
  for (let length = Math.max(1, target.length - 2); length <= Math.min(source.length, target.length + 2); length += 1) {
    for (let start = 0; start + length <= source.length; start += 1) {
      best = Math.max(best, koreanTextSimilarity(target, source.slice(start, start + length)));
    }
  }
  return Math.round(best * 10_000) / 10_000;
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^가-힣a-z0-9]/gu, ""); }
