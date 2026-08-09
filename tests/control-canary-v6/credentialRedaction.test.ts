import { describe, expect, test } from "vitest";
import { safeJson } from "@/lib/google-sheets/sheetSchemas";

describe("Google credential redaction", () => {
  test("redacts credential paths, client emails and key material", () => {
    const serialized = safeJson({
      keyFilePath: "sensitive/service-account.json",
      credentialPath: "sensitive/service-account.json",
      clientEmail: "service-account@example.invalid",
      privateKey: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----"
    });
    expect(serialized).not.toContain("sensitive/service-account.json");
    expect(serialized).not.toContain("service-account@example.invalid");
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
    expect(serialized.match(/\[REDACTED\]/gu)?.length).toBe(4);
  });
});
