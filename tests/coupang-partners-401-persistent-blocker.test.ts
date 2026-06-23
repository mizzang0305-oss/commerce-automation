import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

const blockerDocPath = path.join(process.cwd(), "docs", "COUPANG_PARTNERS_401_PERSISTENT_BLOCKER.md");
const authDiagnosticsPath = path.join(process.cwd(), "docs", "COUPANG_PARTNERS_AUTH_DIAGNOSTICS.md");

describe("Coupang Partners persistent 401 blocker closure", () => {
  test("documents resolved internal guards and remaining external verification gate", () => {
    expect(existsSync(blockerDocPath)).toBe(true);

    const doc = readFileSync(blockerDocPath, "utf8");

    expect(doc).toContain("COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_ALIGNMENT");
    expect(doc).toContain("provider enabled reaches live path");
    expect(doc).toContain("customer/partner id reaches live path");
    expect(doc).toContain("readiness and live builder use shared env reader");
    expect(doc).toContain("baseline candidate exclusion guard passes");
    expect(doc).toContain("retry loop blocked");
    expect(doc).toContain("raw secrets masked");
    expect(doc).toContain("Coupang Partners server still returns HTTP 401 after alignment pass");
    expect(doc).toContain("API key active");
    expect(doc).toContain("access/secret key pair match");
    expect(doc).toContain("partner/customer id belongs to same account");
    expect(doc).toContain("account/API permission enabled");
    expect(doc).toContain("no whitespace/quote/newline in env values");
    expect(doc).toContain("process restarted after env edit");
    expect(doc).toContain("Do not retry live scout/import until external verification is complete and fresh explicit approval is provided.");
    expect(doc).toContain("external_api_call_count=1");
    expect(doc).toContain("candidate_selected_or_imported=false");
  });

  test("keeps persistent 401 closure secret-safe and side-effect safe", () => {
    const doc = readFileSync(blockerDocPath, "utf8");

    expect(doc).toContain("Coupang Partners API recall: blocked");
    expect(doc).toContain("candidate insert/update: blocked");
    expect(doc).toContain("render/R2/DB/YouTube side effects: blocked");
    expect(doc).not.toMatch(/access-key=|signature=|Authorization|Bearer|link\.coupang\.com|thumbnail|imageUrl/i);
  });

  test("links the closure from auth diagnostics", () => {
    const diagnostics = readFileSync(authDiagnosticsPath, "utf8");

    expect(diagnostics).toContain("COUPANG_PARTNERS_401_PERSISTENT_BLOCKER.md");
    expect(diagnostics).toContain("COUPANG_PARTNERS_API_HTTP_401_PERSISTED_AFTER_ALIGNMENT");
  });
});
