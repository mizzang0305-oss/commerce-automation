import { mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function targetPath() {
  const root = await mkdtemp(join(tmpdir(), "atomic-json-"));
  roots.push(root);
  return join(root, "state.json");
}

function filesystemError(code: string) {
  return Object.assign(new Error(code), { code });
}

describe("atomic JSON publication", () => {
  it("retries only a bounded Windows rename contention and publishes the complete document", async () => {
    const target = await targetPath();
    const waits: number[] = [];
    const renameFile = vi.fn(async (source: string, destination: string) => {
      if (renameFile.mock.calls.length <= 2) throw filesystemError("EPERM");
      await rename(source, destination);
    });

    await atomicWriteJson(target, { revision: 7 }, {
      platform: "win32",
      renameFile,
      wait: async (milliseconds) => { waits.push(milliseconds); },
    });

    expect(renameFile).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([10, 25]);
    expect(JSON.parse(await readFile(target, "utf8"))).toEqual({ revision: 7 });
  });

  it.each(["ENOENT", "EXDEV", "EINVAL"])("never retries deterministic %s publication failures", async (code) => {
    const target = await targetPath();
    const renameFile = vi.fn(async () => { throw filesystemError(code); });
    const wait = vi.fn(async () => undefined);

    await expect(atomicWriteJson(target, { revision: 1 }, { platform: "win32", renameFile, wait })).rejects.toMatchObject({ code });
    expect(renameFile).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not retry rename contention outside Windows", async () => {
    const target = await targetPath();
    const renameFile = vi.fn(async () => { throw filesystemError("EPERM"); });
    const wait = vi.fn(async () => undefined);

    await expect(atomicWriteJson(target, { revision: 1 }, { platform: "linux", renameFile, wait })).rejects.toMatchObject({ code: "EPERM" });
    expect(renameFile).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("fails after the finite Windows contention budget is exhausted", async () => {
    const target = await targetPath();
    const renameFile = vi.fn(async () => { throw filesystemError("EBUSY"); });
    const wait = vi.fn(async () => undefined);

    await expect(atomicWriteJson(target, { revision: 1 }, { platform: "win32", renameFile, wait })).rejects.toMatchObject({ code: "EBUSY" });
    expect(renameFile).toHaveBeenCalledTimes(6);
    expect(wait.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([10, 25, 50, 100, 200]);
  });
});
