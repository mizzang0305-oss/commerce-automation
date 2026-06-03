import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("production runbook and UTF-8 smoke routine", () => {
  test("documents PowerShell UTF-8 body-file smoke steps", () => {
    const readme = read("README.md");
    const runbook = read("docs/07_OPERATIONS_RUNBOOK.md");
    const qa = read("docs/08_TEST_AND_QA_CHECKLIST.md");

    for (const doc of [readme, runbook, qa]) {
      expect(doc).toContain("scripts/check-mojibake.mjs");
      expect(doc).toContain("tmp-coupang-import-body.json");
      expect(doc).toContain("application/json; charset=utf-8");
      expect(doc).toContain("PowerShell console rendering");
    }
  });

  test("documents the verification error-triage routine", () => {
    const runbook = read("docs/07_OPERATIONS_RUNBOOK.md");
    const qa = read("docs/08_TEST_AND_QA_CHECKLIST.md");

    for (const doc of [runbook, qa]) {
      expect(doc).toContain("Verification Error-Triage Routine");
      expect(doc).toContain("failed phase");
      expect(doc).toContain("root cause");
      expect(doc).toContain("fake success");
      expect(doc).toContain("NOT RUN");
    }
  });
});
