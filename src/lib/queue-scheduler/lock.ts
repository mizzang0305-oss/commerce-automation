import { mkdir, open, readFile, unlink } from "node:fs/promises";
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
      await unlink(path);
    }
  }
  throw new Error("SCHEDULER_ALREADY_RUNNING");
}

async function readLock(path: string): Promise<LockData | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as LockData; } catch { return null; }
}
