import { describe, expect, test } from "vitest";

import {
  buildCoupangPartnersAuthDiagnostic,
  buildCoupangPartnersHttpFailureGuard,
  buildCoupangPartnersSearchRequest,
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

  test("uses the same env reader for readiness and live request building without exposing raw values", () => {
    const env = {
      COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
      COUPANG_PARTNERS_ACCESS_KEY: "partners-access-value",
      COUPANG_PARTNERS_SECRET_KEY: "partners-secret-value",
      COUPANG_PARTNER_ID: "partner-id-value"
    };
    const diagnostic = buildCoupangPartnersAuthDiagnostic({ envFilePresent: true, env });
    const request = buildCoupangPartnersSearchRequest({
      env,
      keyword: "rainy rack",
      signedDate: "260623T000000Z"
    });
    const serialized = JSON.stringify(request);

    expect(diagnostic).toMatchObject({
      partners_provider_enabled: true,
      access_key_present: true,
      secret_key_present: true,
      customer_id_or_partner_id_present: true
    });
    expect(request.ok).toBe(true);
    expect(request.safe_summary).toMatchObject({
      provider_enabled: true,
      access_key_present: true,
      secret_key_present: true,
      customer_id_or_partner_id_present: true,
      signature_builder_present: true,
      raw_values_masked: true
    });
    expect(request.no_call_alignment_check).toMatchObject({
      readiness_uses_shared_env_reader: true,
      live_request_builder_uses_shared_env_reader: true,
      provider_enabled_reaches_live_path: true,
      customer_or_partner_id_reaches_live_path: true,
      env_key_drift_blocks_live_call: true
    });
    expect(serialized).not.toContain("partners-access-value");
    expect(serialized).not.toContain("partners-secret-value");
    expect(serialized).not.toContain("partner-id-value");
    expect(serialized).not.toMatch(/Authorization|access-key|signature=|HmacSHA256/i);
    expect(serialized).not.toContain("https://api-gateway.coupang.com");
  });

  test("blocks before a live API call when provider or customer/partner id readiness is missing", () => {
    const providerDisabled = buildCoupangPartnersSearchRequest({
      env: {
        COUPANG_PARTNERS_PROVIDER_ENABLED: "false",
        COUPANG_PARTNERS_ACCESS_KEY: "partners-access-value",
        COUPANG_PARTNERS_SECRET_KEY: "partners-secret-value",
        COUPANG_PARTNER_ID: "partner-id-value"
      },
      keyword: "rainy rack",
      signedDate: "260623T000000Z"
    });
    const missingPartnerId = buildCoupangPartnersSearchRequest({
      env: {
        COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
        COUPANG_PARTNERS_ACCESS_KEY: "partners-access-value",
        COUPANG_PARTNERS_SECRET_KEY: "partners-secret-value"
      },
      keyword: "rainy rack",
      signedDate: "260623T000000Z"
    });

    expect(providerDisabled).toMatchObject({
      ok: false,
      blocker: "COUPANG_PARTNERS_PROVIDER_DISABLED",
      external_api_call_allowed: false,
      external_api_called: false
    });
    expect(missingPartnerId).toMatchObject({
      ok: false,
      blocker: "COUPANG_PARTNERS_CUSTOMER_OR_PARTNER_ID_MISSING",
      external_api_call_allowed: false,
      external_api_called: false
    });
  });
});
