import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { link, mkdir, open, readFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const LOCK_SCHEMA_VERSION = "sheets-runner-lock-v2";
const MAX_RECOVERY_ATTEMPTS = 8;

type ProcessInspection =
  | { status: "running"; processStartTime: string }
  | { status: "not_found" }
  | { status: "unverifiable" };

type SheetsRunnerLockMetadata = {
  schemaVersion: typeof LOCK_SCHEMA_VERSION;
  pid: number;
  processStartTime: string;
  createdAt: string;
  hostname: string;
  runnerId: string;
  nonce: string;
};

function errorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
}

function safeError(code: string) {
  return new Error(code);
}

function validMetadata(value: unknown): value is SheetsRunnerLockMetadata {
  if (!value || typeof value !== "object") return false;
  const metadata = value as Partial<SheetsRunnerLockMetadata>;
  return metadata.schemaVersion === LOCK_SCHEMA_VERSION
    && Number.isSafeInteger(metadata.pid) && Number(metadata.pid) > 0
    && typeof metadata.processStartTime === "string" && metadata.processStartTime.length > 0 && metadata.processStartTime.length <= 256
    && typeof metadata.createdAt === "string" && Number.isFinite(Date.parse(metadata.createdAt))
    && typeof metadata.hostname === "string" && metadata.hostname.length > 0 && metadata.hostname.length <= 255
    && typeof metadata.runnerId === "string" && /^[A-Za-z0-9._-]{1,128}$/u.test(metadata.runnerId)
    && typeof metadata.nonce === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(metadata.nonce);
}

async function runProcess(file: string, args: string[]) {
  return new Promise<{ code: number; stdout: string }>((resolve) => {
    let stdout = "";
    let settled = false;
    const child = spawn(file, args, { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    const timer = setTimeout(() => {
      if (!settled) child.kill();
    }, 5_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (stdout.length < 512) stdout += chunk;
    });
    child.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: -1, stdout: "" });
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code: typeof code === "number" ? code : -1, stdout: stdout.trim() });
    });
  });
}

async function inspectWindowsProcess(pid: number): Promise<ProcessInspection> {
  const executable = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe")
    : "powershell.exe";
  const command = `$ErrorActionPreference='Stop'; try { $p=Get-Process -Id ${pid} -ErrorAction Stop; [Console]::Out.Write($p.StartTime.ToUniversalTime().Ticks.ToString()); exit 0 } catch [Microsoft.PowerShell.Commands.ProcessCommandException] { exit 3 } catch { exit 4 }`;
  const result = await runProcess(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", command]);
  if (result.code === 0 && /^\d+$/u.test(result.stdout)) return { status: "running", processStartTime: `windows-start-ticks:${result.stdout}` };
  if (result.code === 3) return { status: "not_found" };
  return { status: "unverifiable" };
}

async function inspectLinuxProcess(pid: number): Promise<ProcessInspection> {
  try {
    const value = await readFile(`/proc/${pid}/stat`, "utf8");
    const endOfName = value.lastIndexOf(")");
    const fields = endOfName >= 0 ? value.slice(endOfName + 2).trim().split(/\s+/u) : [];
    const startTicks = fields[19];
    return startTicks && /^\d+$/u.test(startTicks)
      ? { status: "running", processStartTime: `linux-proc-start-ticks:${startTicks}` }
      : { status: "unverifiable" };
  } catch (error) {
    return errorCode(error) === "ENOENT" ? { status: "not_found" } : { status: "unverifiable" };
  }
}

async function inspectDarwinProcess(pid: number): Promise<ProcessInspection> {
  const result = await runProcess("/bin/ps", ["-p", String(pid), "-o", "lstart="]);
  if (result.code === 0 && result.stdout) return { status: "running", processStartTime: `darwin-ps-start:${result.stdout}` };
  if (result.code === 1) return { status: "not_found" };
  return { status: "unverifiable" };
}

async function inspectProcess(pid: number): Promise<ProcessInspection> {
  if (process.platform === "win32") return inspectWindowsProcess(pid);
  if (process.platform === "linux") return inspectLinuxProcess(pid);
  if (process.platform === "darwin") return inspectDarwinProcess(pid);
  return { status: "unverifiable" };
}

async function readMetadata(lockPath: string) {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (errorCode(error) === "ENOENT") return { kind: "missing" } as const;
    throw safeError("SHEETS_COMMAND_RUNNER_INVALID_LOCK");
  }
  if (!validMetadata(value) || value.hostname !== os.hostname()) throw safeError("SHEETS_COMMAND_RUNNER_INVALID_LOCK");
  return { kind: "metadata", value } as const;
}

async function classifyCollision(lockPath: string) {
  const parsed = await readMetadata(lockPath);
  if (parsed.kind === "missing") return { kind: "missing" } as const;
  const inspection = await inspectProcess(parsed.value.pid);
  if (inspection.status === "not_found") return { kind: "stale", reason: "STALE_LOCK", metadata: parsed.value } as const;
  if (inspection.status === "unverifiable") throw safeError("SHEETS_COMMAND_RUNNER_INVALID_LOCK");
  return inspection.processStartTime === parsed.value.processStartTime
    ? { kind: "live", metadata: parsed.value } as const
    : { kind: "stale", reason: "STALE_LOCK_PID_REUSED", metadata: parsed.value } as const;
}

function quarantineName(metadata: SheetsRunnerLockMetadata) {
  const timestamp = metadata.createdAt.replace(/[^0-9]/gu, "").slice(0, 17);
  return `runner.lock.stale.${timestamp}.${metadata.pid}.${metadata.nonce}`;
}

async function quarantineStaleLock(lockPath: string, metadata: SheetsRunnerLockMetadata) {
  const quarantinePath = path.join(path.dirname(lockPath), quarantineName(metadata));
  try {
    await link(lockPath, quarantinePath);
  } catch (error) {
    if (errorCode(error) === "ENOENT" || errorCode(error) === "EEXIST") return false;
    throw safeError("SHEETS_COMMAND_RUNNER_STALE_QUARANTINE_FAILED");
  }
  try {
    await unlink(lockPath);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") throw safeError("SHEETS_COMMAND_RUNNER_STALE_QUARANTINE_FAILED");
  }
  return true;
}

export async function quarantineVerifiedDeadSheetsRunnerLock(
  repoRoot: string,
  expected: { expectedPid: number; expectedSha256: string },
) {
  if (!Number.isSafeInteger(expected.expectedPid) || expected.expectedPid <= 0 || !/^[0-9a-f]{64}$/u.test(expected.expectedSha256)) {
    throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_EXPECTATION_INVALID");
  }
  const lockPath = path.resolve(repoRoot, "commerce-assets", "sheets-runner", "runner.lock");
  let raw: string;
  try {
    raw = await readFile(lockPath, "utf8");
  } catch {
    throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_LOCK_MISSING");
  }
  const sha256 = createHash("sha256").update(raw).digest("hex");
  if (sha256 !== expected.expectedSha256) throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_HASH_MISMATCH");

  let parsed: { pid?: unknown; runnerId?: unknown; startedAt?: unknown };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_LOCK_INVALID");
  }
  if (parsed.pid !== expected.expectedPid || typeof parsed.runnerId !== "string" || typeof parsed.startedAt !== "string" || !Number.isFinite(Date.parse(parsed.startedAt))) {
    throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_LOCK_INVALID");
  }
  const inspection = await inspectProcess(expected.expectedPid);
  if (inspection.status === "running") throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_OWNER_LIVE");
  if (inspection.status === "unverifiable") throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_OWNER_UNVERIFIABLE");

  const timestamp = parsed.startedAt.replace(/[^0-9]/gu, "").slice(0, 17);
  const quarantinePath = path.join(path.dirname(lockPath), `runner.lock.stale.${timestamp}.${expected.expectedPid}.legacy-${sha256.slice(0, 16)}`);
  try {
    await link(lockPath, quarantinePath);
    await unlink(lockPath);
  } catch {
    throw safeError("SHEETS_COMMAND_RUNNER_MAINTENANCE_QUARANTINE_FAILED");
  }
  return { lockPath, quarantinePath, expectedPid: expected.expectedPid, sha256 };
}

export async function acquireSheetsRunnerLock(repoRoot: string, runnerId: string) {
  if (!/^[A-Za-z0-9._-]{1,128}$/u.test(runnerId)) throw safeError("SHEETS_COMMAND_RUNNER_ID_INVALID");
  const lockDir = path.resolve(repoRoot, "commerce-assets", "sheets-runner");
  const lockPath = path.join(lockDir, "runner.lock");
  await mkdir(lockDir, { recursive: true });

  const owner = await inspectProcess(process.pid);
  if (owner.status !== "running") throw safeError("SHEETS_COMMAND_RUNNER_PROCESS_IDENTITY_UNAVAILABLE");
  const metadata: SheetsRunnerLockMetadata = {
    schemaVersion: LOCK_SCHEMA_VERSION,
    pid: process.pid,
    processStartTime: owner.processStartTime,
    createdAt: new Date().toISOString(),
    hostname: os.hostname(),
    runnerId,
    nonce: randomUUID(),
  };

  for (let attempt = 0; attempt < MAX_RECOVERY_ATTEMPTS; attempt += 1) {
    let handle;
    try {
      handle = await open(lockPath, "wx");
    } catch (error) {
      if (errorCode(error) !== "EEXIST") throw safeError("SHEETS_COMMAND_RUNNER_LOCK_IO_FAILED");
      const collision = await classifyCollision(lockPath);
      if (collision.kind === "live") throw safeError("SHEETS_COMMAND_RUNNER_ALREADY_RUNNING");
      if (collision.kind === "stale") {
        const quarantined = await quarantineStaleLock(lockPath, collision.metadata);
        if (!quarantined) await new Promise((resolve) => setTimeout(resolve, 10));
      }
      continue;
    }

    try {
      await handle.writeFile(JSON.stringify(metadata));
      await handle.sync();
    } catch {
      await handle.close().catch(() => undefined);
      await unlink(lockPath).catch(() => undefined);
      throw safeError("SHEETS_COMMAND_RUNNER_LOCK_INITIALIZATION_FAILED");
    }

    let released = false;
    return {
      lockPath,
      async release() {
        if (released) return;
        released = true;
        await handle.close();
        const current = await readMetadata(lockPath);
        if (current.kind !== "metadata" || current.value.nonce !== metadata.nonce) throw safeError("SHEETS_COMMAND_RUNNER_LOCK_OWNERSHIP_LOST");
        try {
          await unlink(lockPath);
        } catch {
          throw safeError("SHEETS_COMMAND_RUNNER_LOCK_RELEASE_FAILED");
        }
      },
    };
  }
  throw safeError("SHEETS_COMMAND_RUNNER_LOCK_RECOVERY_RACE");
}
