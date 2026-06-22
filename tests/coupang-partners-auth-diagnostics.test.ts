import { describe, expect, test } from "vitest";

import {
  buildCoupangPartnersAuthDiagnostic,
  buildCoupangPartnersHttpFailureGuard,
  runCoupangPartnersSignatureSelfTest
} from "@/lib/coupang/partnersAuthDiagnostics";

describe("Coupang Partners auth diagnostics", () => {
  test("reports auth readiness as booleans without exposing credentials or raw request data", () => {
    const diagnostic = buildCoupangPartnersAuthDiagnostic({
      envFilePresent: true,
      env: {
        COUPANG_PARTNERS_ACCESS_KEY: "dummy-access",
        COUPANG_PARTNERS_SECRET_KEY: "dummy-secret",
        COUPANG_PARTNERS_PROVIDER_ENABLED: "true"
      }
    });
    const serialized = JSON.stringify(diagnostic);

    expect(diagnostic).toMatchObject({
      env_file_present: true,
      partners_provider_enabled: true,
      access_key_present: true,
      secret_key_present: true,
      customer_id_or_partner_id_present: false,
      signature_builder_present: true,
      timestamp_present_or_generated: true,
      clock_skew_safe_check_available: true,
      request_path_present: true,
      method_present: true,
      raw_values_masked: true
    });
    expect(serialized).not.toContain("dummy-access");
    expect(serialized).not.toContain("dummy-secret");
    expect(serialized).not.toMatch(/Authorization|access-key|signature=|HmacSHA256/i);
    expect(serialized).not.toContain("https://api-gateway.coupang.com");
  });

  test("runs a deterministic signature self-test with dummy credentials only", () => {
    const result = runCoupangPartnersSignatureSelfTest();
    const serialized = JSON.stringify(result);

    expect(result).toEqual({
      signature_builder_present: true,
      deterministic_output: true,
      method_present: true,
      request_path_present: true,
      query_present: true,
      timestamp_check_present: true,
      timestamp_format_valid: true,
      canonicalization_has_undefined: false,
      raw_secret_logged: false,
      raw_signature_logged: false,
      authorization_header_logged: false
    });
    expect(serialized).not.toContain("dummy-access-key");
    expect(serialized).not.toContain("dummy-secret-key");
    expect(serialized).not.toMatch(/CEA algorithm|access-key=|HmacSHA256/i);
  });

  test("hard-stops HTTP 401 without retry, import, render, R2, or YouTube side effects", () => {
    const guard = buildCoupangPartnersHttpFailureGuard({
      httpStatus: 401,
      baselineCandidateId: "candidate-490aa6d25e8ea89d"
    });

    expect(guard).toMatchObject({
      ok: false,
      blocker: "COUPANG_PARTNERS_API_HTTP_401",
      candidate_import_attempted: false,
      candidate_created: false,
      candidate_updated: false,
      auto_retry_attempted: false,
      requires_fresh_approval: true,
      render_attempted: false,
      R2_uploaded: false,
      YouTube_Execute: false,
      baseline_candidate_excluded: true
    });
  });
});
