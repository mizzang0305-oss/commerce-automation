import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

const clientFiles = [
  "src/components/commerce-control/CommerceLoginForm.tsx", "src/components/commerce-control/CommandButton.tsx",
  "src/components/commerce-control/QueueCards.tsx", "src/components/commerce-control/QueueDetailEditor.tsx",
  "src/components/commerce-control/CommandList.tsx", "src/components/commerce-control/SettingsEditor.tsx"
];

describe("commerce control client credential boundary", () => {
  test("does not reference server credentials from client modules", () => {
    const source = clientFiles.map((file) => readFileSync(file, "utf8")).join("\n");
    for (const forbidden of ["GOOGLE_SERVICE_ACCOUNT", "PRIVATE_KEY", "COMMERCE_CONTROL_PASSWORD", "process.env", "SUPABASE_SERVICE_ROLE_KEY"]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
