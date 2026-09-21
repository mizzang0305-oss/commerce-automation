import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("fresh disposable pilot namespace", () => {
  it("creates a timestamped namespace without rewriting historical queue state", async () => {
    const source = await readFile("scripts/queue-scheduler/configure-pilot.ts", "utf8");
    expect(source).toContain('resolve(base, "pilots", pilotId)');
    expect(source).toContain('"active-pilot.json"');
    expect(source).not.toMatch(/rm\(|unlink\(|truncate/iu);
  });
  it("maps wrapper exit statuses distinctly", async () => {
    const source = await readFile("scripts/queue-scheduler/run-next-batch.ts", "utf8");
    expect(source).toContain('status === "partial"'); expect(source).toContain("process.exitCode = 2");
    expect(source).toContain('status === "blocked_preflight"'); expect(source).toContain("process.exitCode = 3");
    expect(source).toContain('status === "failed"'); expect(source).toContain("process.exitCode = 4");
  });
});
