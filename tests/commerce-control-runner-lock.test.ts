import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { acquireSheetsRunnerLock, quarantineVerifiedDeadSheetsRunnerLock } from "@/lib/commerce-control/runnerLock";

const directories: string[] = [];
const execFileAsync = promisify(execFile);

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Sheets command runner lock", () => {
  async function root() {
    const value = await mkdtemp(path.join(os.tmpdir(), "sheets-runner-lock-"));
    directories.push(value);
    return value;
  }

  function lockPath(repoRoot: string) {
    return path.join(repoRoot, "commerce-assets", "sheets-runner", "runner.lock");
  }

  function validLock(overrides: Partial<Record<"pid" | "processStartTime" | "createdAt" | "hostname" | "runnerId" | "nonce", string | number>> = {}) {
    return {
      schemaVersion: "sheets-runner-lock-v2",
      pid: 2_147_483_647,
      processStartTime: "test-process-start-identity",
      createdAt: "2026-09-20T00:00:00.000Z",
      hostname: os.hostname(),
      runnerId: "fixture-runner",
      nonce: "00000000-0000-4000-8000-000000000001",
      ...overrides,
    };
  }

  async function seed(repoRoot: string, value: unknown) {
    const target = lockPath(repoRoot);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value), { encoding: "utf8", flag: "wx" });
    return target;
  }

  test("acquires atomically when no lock exists and removes it on normal release", async () => {
    const repoRoot = await root();
    const lock = await acquireSheetsRunnerLock(repoRoot, "runner-a");
    const metadata = JSON.parse(await readFile(lock.lockPath, "utf8")) as Record<string, unknown>;

    expect(metadata).toMatchObject({
      schemaVersion: "sheets-runner-lock-v2",
      pid: process.pid,
      hostname: os.hostname(),
      runnerId: "runner-a",
    });
    expect(metadata.processStartTime).toEqual(expect.any(String));
    expect(metadata.createdAt).toEqual(expect.any(String));
    expect(metadata.nonce).toEqual(expect.any(String));

    await lock.release();
    await expect(stat(lock.lockPath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  test("blocks a duplicate live runner with matching PID and process identity", async () => {
    const repoRoot = await root();
    const first = await acquireSheetsRunnerLock(repoRoot, "runner-a");
    await expect(acquireSheetsRunnerLock(repoRoot, "runner-b")).rejects.toThrow("SHEETS_COMMAND_RUNNER_ALREADY_RUNNING");
    await first.release();
  });

  test("allows Daily69 ControlRunner to continue after recovering a dead-PID lock", async () => {
    const repoRoot = await root();
    await seed(repoRoot, validLock());

    const recovered = await acquireSheetsRunnerLock(repoRoot, "daily69-control-runner");
    const names = await readdir(path.dirname(lockPath(repoRoot)));

    expect(names.filter((name) => name.startsWith("runner.lock.stale."))).toHaveLength(1);
    expect(JSON.parse(await readFile(recovered.lockPath, "utf8"))).toMatchObject({ runnerId: "daily69-control-runner", pid: process.pid });
    await recovered.release();
  });

  test("treats a reused PID with a different process identity as stale", async () => {
    const repoRoot = await root();
    await seed(repoRoot, validLock({ pid: process.pid, processStartTime: "different-process-start-identity" }));

    const recovered = await acquireSheetsRunnerLock(repoRoot, "runner-after-pid-reuse");
    const names = await readdir(path.dirname(lockPath(repoRoot)));

    expect(names.filter((name) => name.startsWith("runner.lock.stale."))).toHaveLength(1);
    await recovered.release();
  });

  test("fails closed and preserves a malformed lock", async () => {
    const repoRoot = await root();
    const target = lockPath(repoRoot);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, "not-json", { encoding: "utf8", flag: "wx" });

    await expect(acquireSheetsRunnerLock(repoRoot, "runner-a")).rejects.toThrow("SHEETS_COMMAND_RUNNER_INVALID_LOCK");
    expect(await readFile(target, "utf8")).toBe("not-json");
    expect((await readdir(path.dirname(target))).filter((name) => name.startsWith("runner.lock.stale."))).toHaveLength(0);
  });

  test("allows exactly one winner during simultaneous acquisition", async () => {
    const repoRoot = await root();
    const attempts = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => acquireSheetsRunnerLock(repoRoot, `runner-${index}`)));
    const winners = attempts.filter((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireSheetsRunnerLock>>> => attempt.status === "fulfilled");
    const losers = attempts.filter((attempt): attempt is PromiseRejectedResult => attempt.status === "rejected");

    expect(winners).toHaveLength(1);
    expect(losers).toHaveLength(7);
    for (const loser of losers) expect(loser.reason).toMatchObject({ message: "SHEETS_COMMAND_RUNNER_ALREADY_RUNNING" });
    await winners[0].value.release();
  });

  test("recovers on the next invocation from crash residue", async () => {
    const repoRoot = await root();
    await seed(repoRoot, validLock({ nonce: "00000000-0000-4000-8000-000000000002", runnerId: "crashed-runner" }));

    const next = await acquireSheetsRunnerLock(repoRoot, "replacement-runner");

    expect(JSON.parse(await readFile(next.lockPath, "utf8"))).toMatchObject({ runnerId: "replacement-runner" });
    expect((await readdir(path.dirname(next.lockPath))).filter((name) => name.startsWith("runner.lock.stale."))).toHaveLength(1);
    await next.release();
  });

  test("permits restart after release", async () => {
    const repoRoot = await root();
    const first = await acquireSheetsRunnerLock(repoRoot, "runner-a");
    await first.release();
    const restarted = await acquireSheetsRunnerLock(repoRoot, "runner-b");
    await restarted.release();
  });

  test("maintenance quarantines an exact-hash legacy lock only after proving its PID dead", async () => {
    const repoRoot = await root();
    const legacy = JSON.stringify({ pid: 2_147_483_647, runnerId: "daily69-control-runner", startedAt: "2026-09-12T23:21:18.937Z" });
    const target = lockPath(repoRoot);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, legacy, { encoding: "utf8", flag: "wx" });
    const expectedSha256 = createHash("sha256").update(legacy).digest("hex");

    const result = await quarantineVerifiedDeadSheetsRunnerLock(repoRoot, { expectedPid: 2_147_483_647, expectedSha256 });

    expect(result).toMatchObject({ expectedPid: 2_147_483_647, sha256: expectedSha256 });
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(result.quarantinePath, "utf8")).toBe(legacy);
  });

  test("maintenance preserves the lock when its exact hash does not match", async () => {
    const repoRoot = await root();
    const target = await seed(repoRoot, { pid: 2_147_483_647, runnerId: "daily69-control-runner", startedAt: "2026-09-12T23:21:18.937Z" });

    await expect(quarantineVerifiedDeadSheetsRunnerLock(repoRoot, { expectedPid: 2_147_483_647, expectedSha256: "0".repeat(64) }))
      .rejects.toThrow("SHEETS_COMMAND_RUNNER_MAINTENANCE_HASH_MISMATCH");
    await expect(stat(target)).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  test("maintenance CLI quarantines an exact verified dead legacy lock", async () => {
    const repoRoot = await root();
    const legacy = JSON.stringify({ pid: 2_147_483_647, runnerId: "daily69-control-runner", startedAt: "2026-09-12T23:21:18.937Z" });
    const target = lockPath(repoRoot);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, legacy, { encoding: "utf8", flag: "wx" });
    const expectedSha256 = createHash("sha256").update(legacy).digest("hex");

    const result = await execFileAsync(process.execPath, [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/automation/quarantine-stale-sheets-runner-lock.ts",
      "--repo-root",
      repoRoot,
      "--expected-pid",
      "2147483647",
      "--expected-sha256",
      expectedSha256,
    ], { cwd: process.cwd(), encoding: "utf8", windowsHide: true });
    const receipt = JSON.parse(result.stdout) as Record<string, unknown>;

    expect(receipt).toMatchObject({ event: "sheets_runner_stale_lock_quarantined", expectedPid: 2_147_483_647, sha256: expectedSha256 });
    await expect(stat(target)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
