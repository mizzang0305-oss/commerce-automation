import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { acquireSheetsRunnerLock } from "@/lib/commerce-control/runnerLock";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Sheets command runner lock", () => {
  test("blocks a duplicate runner and permits restart after release", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "sheets-runner-lock-"));
    directories.push(root);
    const first = await acquireSheetsRunnerLock(root, "runner-a");
    await expect(acquireSheetsRunnerLock(root, "runner-b")).rejects.toThrow("SHEETS_COMMAND_RUNNER_ALREADY_RUNNING");
    await first.release();
    const restarted = await acquireSheetsRunnerLock(root, "runner-b");
    await restarted.release();
  });
});
