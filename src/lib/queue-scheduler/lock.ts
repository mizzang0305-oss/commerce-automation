import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type LockData = { pid: number; acquiredAt: string; runId: string };

export async function acquireProcessLock(path: string, runId: string, staleMs: number): Promise<() => Promise<void>> {
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, "wx");
      await handle.writeFile(JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), runId } satisfies LockData), "utf8");
      await handle.sync();
      await handle.close();
      return async () => { try { await unlink(path); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const current = await readLock(path);
      const stale = !current || Date.now() - Date.parse(current.acquiredAt) > staleMs;
      if (!stale || attempt > 0) throw new Error("SCHEDULER_ALREADY_RUNNING");
      try {
        await unlink(path);
      } catch (unlinkError) {
        if ((unlinkError as NodeJS.ErrnoException).code !== "ENOENT") throw unlinkError;
      }
    }
  }
  throw new Error("SCHEDULER_ALREADY_RUNNING");
}

async function readLock(path: string): Promise<LockData | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as LockData; } catch { return null; }
}

export async function acquireStrictProcessLock(path: string, runId: string): Promise<() => Promise<void>> {
  const token = randomUUID();
  const ownerPath = `${path}/owner.json`;
  await mkdir(dirname(path), { recursive: true });
  try { await mkdir(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("SCHEDULER_ALREADY_RUNNING"); throw error; }
  try {
    await writeFile(ownerPath, JSON.stringify({ pid: process.pid, acquiredAt: new Date().toISOString(), runId, token }), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    await rmdir(path).catch(() => undefined);
    throw error;
  }
  return async () => {
    let current: { token?: unknown };
    try { current = JSON.parse(await readFile(ownerPath, "utf8")) as { token?: unknown }; }
    catch { throw new Error("STRICT_LOCK_OWNERSHIP_UNVERIFIED"); }
    if (current.token !== token) throw new Error("STRICT_LOCK_OWNERSHIP_LOST");
    await unlink(ownerPath);
    await rmdir(path);
  };
}
