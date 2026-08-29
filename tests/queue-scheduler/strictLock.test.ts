import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acquireStrictProcessLock } from "../../src/lib/queue-scheduler/lock";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("strict process lock", () => {
  it("publishes an atomic directory lock and blocks every concurrent acquire until owner release", async () => {
    const root = await mkdtemp(join(tmpdir(), "strict-lock-")); roots.push(root);
    const lockPath = join(root, "operation.lock");
    const release = await acquireStrictProcessLock(lockPath, "owner-1");
    expect(JSON.parse(await readFile(join(lockPath, "owner.json"), "utf8"))).toMatchObject({ runId: "owner-1", token: expect.any(String) });
    await expect(acquireStrictProcessLock(lockPath, "owner-2")).rejects.toThrow("SCHEDULER_ALREADY_RUNNING");
    await release();
    const releaseSecond = await acquireStrictProcessLock(lockPath, "owner-2");
    await releaseSecond();
  });

  it("refuses to remove a lock whose owner token changed", async () => {
    const root = await mkdtemp(join(tmpdir(), "strict-lock-owner-")); roots.push(root);
    const lockPath = join(root, "operation.lock");
    const release = await acquireStrictProcessLock(lockPath, "owner-1");
    const ownerPath = join(lockPath, "owner.json");
    const owner = JSON.parse(await readFile(ownerPath, "utf8"));
    await writeFile(ownerPath, JSON.stringify({ ...owner, token: "different-owner" }));
    await expect(release()).rejects.toThrow("STRICT_LOCK_OWNERSHIP_LOST");
    await expect(acquireStrictProcessLock(lockPath, "owner-2")).rejects.toThrow("SCHEDULER_ALREADY_RUNNING");
  });
});
