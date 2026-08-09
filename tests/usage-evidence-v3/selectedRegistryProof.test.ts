import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("V3 selected registry proof orchestration", () => {
  test("blocks RUN 2 unless RUN 1 reaches target and has a selected registry", async () => {
    const script = await readFile("scripts/usage-evidence/run-v3-live-capacity-proof.ts", "utf8");
    expect(script).toContain('marginal.result !== "TARGET_REACHED" || !selectedRegistry');
    expect(script).toContain("if (acceptance.pass)");
    expect(script).toContain("secondScoutApiCalls === 0");
    expect(script).toContain("activeSnapshotUnchanged");
    expect(script).toContain("reserveSnapshotUnchanged");
    expect(script).toContain("allocationSnapshotUnchanged");
  });

  test("PowerShell wrapper has mandatory inputs, process scope, forced safety, and no absolute defaults", async () => {
    const script = await readFile("scripts/usage-evidence/run-v3-live-capacity-proof-no-upload.ps1", "utf8");
    expect(script.match(/Mandatory\s*=\s*\$true/gu)).toHaveLength(5);
    expect(script).toContain('SetEnvironmentVariable($key, $safetyFlags[$key], "Process")');
    expect(script).toContain('QUEUE_SCHEDULER_ENABLED = "false"');
    expect(script).not.toContain("common-no-upload.ps1");
    expect(script).not.toMatch(/[A-Z]:\\\\Users\\\\/u);
  });
});
