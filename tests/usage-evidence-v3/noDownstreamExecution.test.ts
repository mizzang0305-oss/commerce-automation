import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { CAPACITY_PROOF_SAFETY_ENV } from "@/lib/usage-evidence/liveCapacityProof";

describe("V3 configured live proof downstream boundary", () => {
  test("forces all writer and scheduler boundaries off", async () => {
    expect(CAPACITY_PROOF_SAFETY_ENV).toMatchObject({
      QUEUE_SCHEDULER_ENABLED: "false",
      GOOGLE_SHEETS_WRITE: "0",
      GOOGLE_DRIVE_WRITE: "0",
      R2_WRITE: "0",
      DB_WRITE: "0",
      PLATFORM_UPLOAD: "0",
      PRODUCTION_DEPLOY: "0"
    });
    const script = await readFile("scripts/usage-evidence/run-v3-live-capacity-proof.ts", "utf8");
    expect(script).not.toMatch(/from\s+["'][^"']*(google-sheets|uploads|videoExecutor|commandRunner)/u);
    expect(script).not.toContain("runNextBatch(");
  });
});
