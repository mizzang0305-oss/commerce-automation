import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("V3 sanitized source opportunity plan", () => {
  test("uses only explicit local sanitized sources with rights and privacy evidence", () => {
    const plan = JSON.parse(readFileSync(resolve("config/usage-evidence/library-v3-source-pack-plan.json"), "utf8")) as {
      sanitizedVideoPools: Array<Record<string, unknown>>;
      sourceLimits: Record<string, number>;
    };
    expect(plan.sanitizedVideoPools).toHaveLength(9);
    expect(new Set(plan.sanitizedVideoPools.map((source) => source.sourceId)).size).toBe(9);
    for (const source of plan.sanitizedVideoPools) {
      expect(String(source.relativePath)).not.toMatch(/^(https?:|s3:|gs:)/u);
      expect(String(source.rightsBasis)).toMatch(/^local_project_generated_/u);
      expect(source.privacyReviewRequired).toBe(true);
      expect(["pass", "not_available"]).toContain(source.sourceHumanReviewStatus);
    }
    expect(plan.sourceLimits.minimumDistinctNewSourceIds).toBe(8);
    expect(plan.sourceLimits.maxSameSourceVideoDaily).toBe(15);
  });
});
