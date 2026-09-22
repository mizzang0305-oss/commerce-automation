import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export class FileYouTubePublicPublisherStore<TState extends object> {
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly statePath: string,
    private readonly initialState: TState
  ) {}

  async read(): Promise<TState> {
    return clone(await this.readState());
  }

  async mutate<TResult>(operation: (state: TState) => TResult | Promise<TResult>): Promise<TResult> {
    const previous = this.pending;
    let release: (() => void) | undefined;
    this.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await this.mutateWithFileLock(operation);
    } finally {
      release?.();
    }
  }

  private async mutateWithFileLock<TResult>(operation: (state: TState) => TResult | Promise<TResult>): Promise<TResult> {
    const lockPath = `${this.statePath}.lock`;
    await mkdir(dirname(this.statePath), { recursive: true });

    let lock: Awaited<ReturnType<typeof open>> | null = null;
    try {
      lock = await open(lockPath, "wx");
      const state = await this.readState();
      const result = await operation(state);
      await this.writeState(state);
      return result;
    } catch (error) {
      if (hasCode(error, "EEXIST")) {
        throw new Error("YOUTUBE_PUBLIC_PUBLISHER_STATE_LOCK_HELD");
      }
      throw error;
    } finally {
      await lock?.close();
      if (lock) {
        await unlink(lockPath).catch(() => undefined);
      }
    }
  }

  private async readState(): Promise<TState> {
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as TState;
    } catch (error) {
      if (hasCode(error, "ENOENT")) {
        return clone(this.initialState);
      }
      throw error;
    }
  }

  private async writeState(state: TState) {
    const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporaryPath, this.statePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

function hasCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
