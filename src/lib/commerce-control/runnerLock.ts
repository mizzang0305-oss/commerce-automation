import { mkdir, open, rm } from "node:fs/promises";
import path from "node:path";

export async function acquireSheetsRunnerLock(repoRoot: string, runnerId: string) {
  const lockDir = path.resolve(repoRoot, "commerce-assets", "sheets-runner");
  const lockPath = path.join(lockDir, "runner.lock");
  await mkdir(lockDir, { recursive: true });
  try {
    const handle = await open(lockPath, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, runnerId, startedAt: new Date().toISOString() }));
    return {
      lockPath,
      async release() { await handle.close(); await rm(lockPath, { force: true }); }
    };
  } catch {
    throw new Error("SHEETS_COMMAND_RUNNER_ALREADY_RUNNING");
  }
}
