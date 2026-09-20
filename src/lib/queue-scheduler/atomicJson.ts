import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const WINDOWS_RENAME_RETRY_DELAYS_MS = [10, 25, 50, 100, 200] as const;

type AtomicWriteOptions = {
  renameFile?: typeof rename;
  wait?: (milliseconds: number) => Promise<unknown>;
  platform?: NodeJS.Platform;
};

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function atomicWriteJson(path: string, value: unknown, options: AtomicWriteOptions = {}): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  const handle = await open(temp, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally { await handle.close(); }
  try {
    await renameWithBoundedWindowsRetry(temp, path, options);
  } catch (error) {
    await rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function renameWithBoundedWindowsRetry(source: string, destination: string, options: AtomicWriteOptions): Promise<void> {
  const renameFile = options.renameFile ?? rename;
  const wait = options.wait ?? delay;
  const platform = options.platform ?? process.platform;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await renameFile(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const retryable = platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "EBUSY");
      if (!retryable || attempt >= WINDOWS_RENAME_RETRY_DELAYS_MS.length) throw error;
      await wait(WINDOWS_RENAME_RETRY_DELAYS_MS[attempt]);
    }
  }
}
