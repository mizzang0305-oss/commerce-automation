import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const clientFiles = [
  "src/components/SettingsForm.tsx",
  "src/components/QueueDetailView.tsx",
  "src/components/QueueTable.tsx"
];

describe("client secret exposure", () => {
  test("does not reference worker or service secrets in client components", () => {
    const combined = clientFiles.map((file) => readFileSync(file, "utf8")).join("\n");

    expect(combined).not.toContain("WORKER_API_SECRET");
    expect(combined).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(combined).not.toContain("COUPANG");
    expect(combined).not.toContain("OPENAI_API_KEY");
    expect(combined).not.toContain("GEMINI_API_KEY");
  });
});
