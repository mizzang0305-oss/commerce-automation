import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const COPY_SOURCE_FILES = [
  "README.md",
  "docs/07_OPERATIONS_RUNBOOK.md",
  "docs/08_TEST_AND_QA_CHECKLIST.md",
  "src/components/DevScenarioPanel.tsx",
  "src/components/QueueDetailView.tsx",
  "src/components/RenderPlanPreview.tsx",
  "src/components/RenderPlanOverrideEditor.tsx",
  "app/api/dev/seed/route.ts",
  "app/api/dev/coupang-product-to-video-smoke/start/route.ts",
  "app/api/dev/coupang-product-to-video-smoke/promote/route.ts",
  "app/api/queue/[id]/render-plan-override/route.ts"
];

const MOJIBAKE_PATTERN = /[\u00ec\u00eb\u00ea\u00ed\u00e2\uFFFD\u5360]|\p{Script=Han}/u;

describe("Korean copy and mojibake guard", () => {
  test("provides a repeatable mojibake source scanner", () => {
    expect(existsSync("scripts/check-mojibake.mjs")).toBe(true);

    const output = execFileSync(
      "node",
      ["scripts/check-mojibake.mjs", "--paths", "README.md", "docs/07_OPERATIONS_RUNBOOK.md", "src/components/DevScenarioPanel.tsx"],
      { encoding: "utf8" }
    );

    expect(output).toContain("mojibake_matches=0");
  });

  test("keeps key Korean operator copy free of mojibake-looking text", () => {
    const offenders = COPY_SOURCE_FILES.flatMap((file) => {
      const text = readFileSync(file, "utf8");
      return text
        .split(/\r?\n/)
        .map((line, index) => ({ file, line: index + 1, text: line }))
        .filter((entry) => MOJIBAKE_PATTERN.test(entry.text));
    });

    expect(offenders).toEqual([]);
  });
});
