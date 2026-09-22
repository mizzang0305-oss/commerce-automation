import { mkdir, open, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { SIMPLE_PRODUCER_SCHEMA, type SimpleProducerState } from "@/lib/simple-producer/types";

export interface SimpleProducerStore {
  read(): Promise<SimpleProducerState>;
  mutate<T>(operation: (state: SimpleProducerState) => T | Promise<T>): Promise<T>;
}

export class InMemorySimpleProducerStore implements SimpleProducerStore {
  private state: SimpleProducerState;
  private pending: Promise<void> = Promise.resolve();

  constructor(initial: SimpleProducerState = initialSimpleProducerState()) {
    this.state = clone(initial);
  }

  async read() {
    return clone(this.state);
  }

  async mutate<T>(operation: (state: SimpleProducerState) => T | Promise<T>) {
    const previous = this.pending;
    let release: (() => void) | undefined;
    this.pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await operation(this.state);
    } finally {
      release?.();
    }
  }
}

export class FileSimpleProducerStore implements SimpleProducerStore {
  private pending: Promise<void> = Promise.resolve();

  constructor(private readonly statePath: string) {}

  async read() {
    return clone(await this.readState());
  }

  async mutate<T>(operation: (state: SimpleProducerState) => T | Promise<T>) {
    const previous = this.pending;
    let release: (() => void) | undefined;
    this.pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await this.mutateWithFileLock(operation);
    } finally {
      release?.();
    }
  }

  private async mutateWithFileLock<T>(operation: (state: SimpleProducerState) => T | Promise<T>) {
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
      if (hasCode(error, "EEXIST")) throw new Error("SIMPLE_PRODUCER_STATE_LOCK_HELD");
      throw error;
    } finally {
      await lock?.close();
      if (lock) await unlink(lockPath).catch(() => undefined);
    }
  }

  private async readState(): Promise<SimpleProducerState> {
    try {
      return JSON.parse(await readFile(this.statePath, "utf8")) as SimpleProducerState;
    } catch (error) {
      if (hasCode(error, "ENOENT")) return initialSimpleProducerState();
      throw error;
    }
  }

  private async writeState(state: SimpleProducerState) {
    const temporaryPath = `${this.statePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporaryPath, this.statePath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }
}

export function initialSimpleProducerState(): SimpleProducerState {
  return { schema: SIMPLE_PRODUCER_SCHEMA, slots: [] };
}

function hasCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === code;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
