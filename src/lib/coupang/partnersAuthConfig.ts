import { createHmac } from "node:crypto";

export const COUPANG_PARTNERS_API_HOST = "https://api-gateway.coupang.com";
export const COUPANG_PARTNERS_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
export const COUPANG_PARTNERS_METHOD = "GET";

export type CoupangPartnersLiveRequestBlocker =
  | "COUPANG_PARTNERS_PROVIDER_DISABLED"
  | "COUPANG_PARTNERS_ACCESS_KEY_MISSING"
  | "COUPANG_PARTNERS_SECRET_KEY_MISSING"
  | "COUPANG_PARTNERS_CUSTOMER_OR_PARTNER_ID_MISSING"
  | "COUPANG_PARTNERS_KEYWORD_MISSING"
  | "COUPANG_PARTNERS_SIGNED_DATE_INVALID";

export type CoupangPartnersEnvReadiness = {
  provider_enabled: boolean;
  access_key_present: boolean;
  secret_key_present: boolean;
  customer_id_or_partner_id_present: boolean;
  signature_builder_present: true;
  raw_values_masked: true;
};

export type CoupangPartnersLiveRequestAlignmentCheck = {
  readiness_uses_shared_env_reader: true;
  live_request_builder_uses_shared_env_reader: true;
  provider_enabled_reaches_live_path: boolean;
  customer_or_partner_id_reaches_live_path: boolean;
  env_key_drift_blocks_live_call: true;
};

export type CoupangPartnersSafeSearchRequest = {
  method: typeof COUPANG_PARTNERS_METHOD;
  url: string;
  headers: {
    Authorization: string;
  };
  toJSON: () => {
    method: typeof COUPANG_PARTNERS_METHOD;
    url_present: true;
    auth_header_present: true;
    raw_values_masked: true;
  };
};

export type CoupangPartnersSearchRequestResult =
  | {
      ok: true;
      blocker: null;
      external_api_call_allowed: true;
      external_api_called: false;
      safe_summary: CoupangPartnersEnvReadiness;
      no_call_alignment_check: CoupangPartnersLiveRequestAlignmentCheck;
      request: CoupangPartnersSafeSearchRequest;
    }
  | {
      ok: false;
      blocker: CoupangPartnersLiveRequestBlocker;
      external_api_call_allowed: false;
      external_api_called: false;
      safe_summary: CoupangPartnersEnvReadiness;
      no_call_alignment_check: CoupangPartnersLiveRequestAlignmentCheck;
      request: null;
    };

type ResolvedCoupangPartnersEnv = {
  readiness: CoupangPartnersEnvReadiness;
  accessKey: string | null;
  secretKey: string | null;
  customerOrPartnerId: string | null;
};

export function readCoupangPartnersEnv(env: Record<string, string | undefined> = process.env): ResolvedCoupangPartnersEnv {
  const accessKey = firstPresent(env.COUPANG_PARTNERS_ACCESS_KEY, env.COUPANG_ACCESS_KEY);
  const secretKey = firstPresent(env.COUPANG_PARTNERS_SECRET_KEY, env.COUPANG_SECRET_KEY);
  const customerOrPartnerId = firstPresent(
    env.COUPANG_CUSTOMER_ID,
    env.COUPANG_PARTNER_ID,
    env.COUPANG_PARTNERS_CUSTOMER_ID
  );

  return {
    readiness: {
      provider_enabled: isTruthy(env.COUPANG_PARTNERS_PROVIDER_ENABLED),
      access_key_present: Boolean(accessKey),
      secret_key_present: Boolean(secretKey),
      customer_id_or_partner_id_present: Boolean(customerOrPartnerId),
      signature_builder_present: true,
      raw_values_masked: true
    },
    accessKey,
    secretKey,
    customerOrPartnerId
  };
}

export function buildCoupangPartnersSearchRequest(input: {
  env?: Record<string, string | undefined>;
  keyword: string;
  limit?: number;
  signedDate?: string;
}): CoupangPartnersSearchRequestResult {
  const resolved = readCoupangPartnersEnv(input.env);
  const alignment = buildAlignmentCheck(resolved.readiness);
  const readinessBlocker = firstReadinessBlocker(resolved.readiness);
  if (readinessBlocker) {
    return blocked(readinessBlocker, resolved.readiness, alignment);
  }

  const keyword = input.keyword.trim();
  if (!keyword) {
    return blocked("COUPANG_PARTNERS_KEYWORD_MISSING", resolved.readiness, alignment);
  }

  const signedDate = input.signedDate ?? buildCoupangSignedDate(new Date());
  if (!isCoupangSignedDate(signedDate)) {
    return blocked("COUPANG_PARTNERS_SIGNED_DATE_INVALID", resolved.readiness, alignment);
  }

  const query = buildCoupangPartnersSearchQuery({ keyword, limit: input.limit });
  const signature = buildCoupangPartnersSignature({
    secretKey: resolved.secretKey!,
    signedDate,
    method: COUPANG_PARTNERS_METHOD,
    path: COUPANG_PARTNERS_SEARCH_PATH,
    query
  });
  const authorization = [
    "CEA algorithm=HmacSHA256",
    `access-key=${resolved.accessKey!}`,
    `signed-date=${signedDate}`,
    `signature=${signature}`
  ].join(", ");

  return {
    ok: true,
    blocker: null,
    external_api_call_allowed: true,
    external_api_called: false,
    safe_summary: resolved.readiness,
    no_call_alignment_check: alignment,
    request: safeRequest(`${COUPANG_PARTNERS_API_HOST}${COUPANG_PARTNERS_SEARCH_PATH}${query}`, authorization)
  };
}

export function buildCoupangPartnersSignature(input: {
  secretKey: string;
  signedDate: string;
  method: string;
  path: string;
  query: string;
}) {
  return createHmac("sha256", input.secretKey)
    .update(`${input.signedDate}${input.method}${input.path}${input.query}`)
    .digest("hex");
}

export function buildCoupangPartnersSearchQuery(input: { keyword: string; limit?: number }) {
  return `?keyword=${encodeURIComponent(input.keyword)}&limit=${normalizeLimit(input.limit)}`;
}

export function buildCoupangSignedDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").slice(2);
}

export function isCoupangSignedDate(value: string) {
  return /^\d{6}T\d{6}Z$/.test(value);
}

function firstReadinessBlocker(readiness: CoupangPartnersEnvReadiness): CoupangPartnersLiveRequestBlocker | null {
  if (!readiness.provider_enabled) {
    return "COUPANG_PARTNERS_PROVIDER_DISABLED";
  }
  if (!readiness.access_key_present) {
    return "COUPANG_PARTNERS_ACCESS_KEY_MISSING";
  }
  if (!readiness.secret_key_present) {
    return "COUPANG_PARTNERS_SECRET_KEY_MISSING";
  }
  if (!readiness.customer_id_or_partner_id_present) {
    return "COUPANG_PARTNERS_CUSTOMER_OR_PARTNER_ID_MISSING";
  }
  return null;
}

function buildAlignmentCheck(readiness: CoupangPartnersEnvReadiness): CoupangPartnersLiveRequestAlignmentCheck {
  return {
    readiness_uses_shared_env_reader: true,
    live_request_builder_uses_shared_env_reader: true,
    provider_enabled_reaches_live_path: readiness.provider_enabled,
    customer_or_partner_id_reaches_live_path: readiness.customer_id_or_partner_id_present,
    env_key_drift_blocks_live_call: true
  };
}

function blocked(
  blocker: CoupangPartnersLiveRequestBlocker,
  safeSummary: CoupangPartnersEnvReadiness,
  noCallAlignmentCheck: CoupangPartnersLiveRequestAlignmentCheck
): CoupangPartnersSearchRequestResult {
  return {
    ok: false,
    blocker,
    external_api_call_allowed: false,
    external_api_called: false,
    safe_summary: safeSummary,
    no_call_alignment_check: noCallAlignmentCheck,
    request: null
  };
}

function safeRequest(url: string, authorization: string): CoupangPartnersSafeSearchRequest {
  return {
    method: COUPANG_PARTNERS_METHOD,
    url,
    headers: {
      Authorization: authorization
    },
    toJSON: () => ({
      method: COUPANG_PARTNERS_METHOD,
      url_present: true,
      auth_header_present: true,
      raw_values_masked: true
    })
  };
}

function firstPresent(...values: Array<string | undefined>) {
  for (const value of values) {
    if (hasValue(value)) {
      return value.trim();
    }
  }
  return null;
}

function hasValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isTruthy(value: unknown) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function normalizeLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 10;
  }
  return Math.max(1, Math.min(10, Math.floor(numeric)));
}
