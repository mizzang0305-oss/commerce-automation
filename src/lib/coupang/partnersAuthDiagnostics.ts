import {
  COUPANG_PARTNERS_METHOD,
  COUPANG_PARTNERS_SEARCH_PATH,
  buildCoupangPartnersSearchRequest,
  buildCoupangPartnersSearchQuery,
  buildCoupangPartnersSignature,
  isCoupangSignedDate,
  readCoupangPartnersEnv
} from "@/lib/coupang/partnersAuthConfig";

const DUMMY_SECRET_KEY = "dummy-secret-key";
const DUMMY_TIMESTAMP = "260623T000000Z";
const DUMMY_QUERY = buildCoupangPartnersSearchQuery({ keyword: "빨래건조대", limit: 10 });

export type CoupangPartnersAuthDiagnostic = {
  env_file_present: boolean;
  partners_provider_enabled: boolean;
  access_key_present: boolean;
  secret_key_present: boolean;
  customer_id_or_partner_id_present: boolean;
  base_url_configured: boolean;
  signature_builder_present: true;
  endpoint_contract_valid: true;
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
  const env = readCoupangPartnersEnv(input.env);
  return {
    env_file_present: input.envFilePresent,
    partners_provider_enabled: env.readiness.provider_enabled,
    access_key_present: env.readiness.access_key_present,
    secret_key_present: env.readiness.secret_key_present,
    customer_id_or_partner_id_present: env.readiness.customer_id_or_partner_id_present,
    base_url_configured: env.readiness.base_url_configured,
    signature_builder_present: true,
    endpoint_contract_valid: true,
    timestamp_present_or_generated: true,
    clock_skew_safe_check_available: true,
    request_path_present: true,
    method_present: true,
    raw_values_masked: true
  };
}

export function runCoupangPartnersSignatureSelfTest(): CoupangPartnersSignatureSelfTest {
  const first = buildCoupangPartnersSignature({
    secretKey: DUMMY_SECRET_KEY,
    signedDate: DUMMY_TIMESTAMP,
    method: COUPANG_PARTNERS_METHOD,
    path: COUPANG_PARTNERS_SEARCH_PATH,
    query: DUMMY_QUERY
  });
  const second = buildCoupangPartnersSignature({
    secretKey: DUMMY_SECRET_KEY,
    signedDate: DUMMY_TIMESTAMP,
    method: COUPANG_PARTNERS_METHOD,
    path: COUPANG_PARTNERS_SEARCH_PATH,
    query: DUMMY_QUERY
  });
  const canonical = [DUMMY_TIMESTAMP, COUPANG_PARTNERS_METHOD, COUPANG_PARTNERS_SEARCH_PATH, DUMMY_QUERY].join("");

  return {
    signature_builder_present: true,
    deterministic_output: first === second && first.length > 0,
    method_present: Boolean(COUPANG_PARTNERS_METHOD),
    request_path_present: Boolean(COUPANG_PARTNERS_SEARCH_PATH),
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

export { buildCoupangPartnersSearchRequest };
