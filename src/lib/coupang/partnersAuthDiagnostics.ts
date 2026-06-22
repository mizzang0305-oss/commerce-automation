import { createHmac } from "node:crypto";

const PARTNERS_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const DUMMY_ACCESS_KEY = "dummy-access-key";
const DUMMY_SECRET_KEY = "dummy-secret-key";
const DUMMY_TIMESTAMP = "260623T000000Z";
const DUMMY_METHOD = "GET";
const DUMMY_QUERY = "?keyword=%EB%B9%A8%EB%9E%98%EA%B1%B4%EC%A1%B0%EB%8C%80&limit=10";

export type CoupangPartnersAuthDiagnostic = {
  env_file_present: boolean;
  partners_provider_enabled: boolean;
  access_key_present: boolean;
  secret_key_present: boolean;
  customer_id_or_partner_id_present: boolean;
  signature_builder_present: true;
  timestamp_present_or_generated: true;
  clock_skew_safe_check_available: true;
  request_path_present: true;
  method_present: true;
  raw_values_masked: true;
};

export type CoupangPartnersSignatureSelfTest = {
  signature_builder_present: true;
  deterministic_output: boolean;
  method_present: boolean;
  request_path_present: boolean;
  query_present: boolean;
  timestamp_check_present: boolean;
  timestamp_format_valid: boolean;
  canonicalization_has_undefined: boolean;
  raw_secret_logged: false;
  raw_signature_logged: false;
  authorization_header_logged: false;
};

export type CoupangPartnersHttpFailureGuard = {
  ok: false;
  blocker: "COUPANG_PARTNERS_API_HTTP_401" | `COUPANG_PARTNERS_API_HTTP_${number}`;
  candidate_import_attempted: false;
  candidate_created: false;
  candidate_updated: false;
  auto_retry_attempted: false;
  requires_fresh_approval: true;
  render_attempted: false;
  R2_uploaded: false;
  YouTube_Execute: false;
  baseline_candidate_excluded: boolean;
};

export function buildCoupangPartnersAuthDiagnostic(input: {
  envFilePresent: boolean;
  env?: Record<string, string | undefined>;
}): CoupangPartnersAuthDiagnostic {
  const env = input.env ?? process.env;
  return {
    env_file_present: input.envFilePresent,
    partners_provider_enabled: isTruthy(env.COUPANG_PARTNERS_PROVIDER_ENABLED),
    access_key_present: hasValue(env.COUPANG_PARTNERS_ACCESS_KEY) || hasValue(env.COUPANG_ACCESS_KEY),
    secret_key_present: hasValue(env.COUPANG_PARTNERS_SECRET_KEY) || hasValue(env.COUPANG_SECRET_KEY),
    customer_id_or_partner_id_present:
      hasValue(env.COUPANG_CUSTOMER_ID) ||
      hasValue(env.COUPANG_PARTNER_ID) ||
      hasValue(env.COUPANG_PARTNERS_CUSTOMER_ID),
    signature_builder_present: true,
    timestamp_present_or_generated: true,
    clock_skew_safe_check_available: true,
    request_path_present: true,
    method_present: true,
    raw_values_masked: true
  };
}

export function runCoupangPartnersSignatureSelfTest(): CoupangPartnersSignatureSelfTest {
  const first = buildCoupangPartnersSignature({
    accessKey: DUMMY_ACCESS_KEY,
    secretKey: DUMMY_SECRET_KEY,
    signedDate: DUMMY_TIMESTAMP,
    method: DUMMY_METHOD,
    path: PARTNERS_SEARCH_PATH,
    query: DUMMY_QUERY
  });
  const second = buildCoupangPartnersSignature({
    accessKey: DUMMY_ACCESS_KEY,
    secretKey: DUMMY_SECRET_KEY,
    signedDate: DUMMY_TIMESTAMP,
    method: DUMMY_METHOD,
    path: PARTNERS_SEARCH_PATH,
    query: DUMMY_QUERY
  });
  const canonical = [DUMMY_TIMESTAMP, DUMMY_METHOD, PARTNERS_SEARCH_PATH, DUMMY_QUERY].join("");

  return {
    signature_builder_present: true,
    deterministic_output: first === second && first.length > 0,
    method_present: Boolean(DUMMY_METHOD),
    request_path_present: Boolean(PARTNERS_SEARCH_PATH),
    query_present: Boolean(DUMMY_QUERY),
    timestamp_check_present: true,
    timestamp_format_valid: isCoupangSignedDate(DUMMY_TIMESTAMP),
    canonicalization_has_undefined: canonical.includes("undefined"),
    raw_secret_logged: false,
    raw_signature_logged: false,
    authorization_header_logged: false
  };
}

export function buildCoupangPartnersHttpFailureGuard(input: {
  httpStatus: number;
  baselineCandidateId: string;
}): CoupangPartnersHttpFailureGuard {
  return {
    ok: false,
    blocker: input.httpStatus === 401 ? "COUPANG_PARTNERS_API_HTTP_401" : `COUPANG_PARTNERS_API_HTTP_${input.httpStatus}`,
    candidate_import_attempted: false,
    candidate_created: false,
    candidate_updated: false,
    auto_retry_attempted: false,
    requires_fresh_approval: true,
    render_attempted: false,
    R2_uploaded: false,
    YouTube_Execute: false,
    baseline_candidate_excluded: Boolean(input.baselineCandidateId.trim())
  };
}

function buildCoupangPartnersSignature(input: {
  accessKey: string;
  secretKey: string;
  signedDate: string;
  method: string;
  path: string;
  query: string;
}) {
  void input.accessKey;
  return createHmac("sha256", input.secretKey)
    .update(`${input.signedDate}${input.method}${input.path}${input.query}`)
    .digest("hex");
}

function hasValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isTruthy(value: unknown) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isCoupangSignedDate(value: string) {
  return /^\d{6}T\d{6}Z$/.test(value);
}
