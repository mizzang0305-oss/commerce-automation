export type CoupangScoutApiFamily = "partners_affiliate" | "seller_openapi" | "unknown";

export type CoupangScoutClassification =
  | "COUPANG_SCOUT_READY"
  | "COUPANG_SCOUT_ENDPOINT_FAMILY_MISMATCH"
  | "COUPANG_SCOUT_KEYWORD_INVALID"
  | "COUPANG_SCOUT_KEYWORD_ENCODING_INVALID"
  | "COUPANG_SCOUT_KEYWORD_POLICY_INVALID"
  | "COUPANG_SCOUT_CREDENTIAL_NOT_ELIGIBLE"
  | "COUPANG_SCOUT_AUTH_SIGNATURE_INVALID"
  | "COUPANG_SCOUT_AUTH_SIGNATURE_EXPIRED"
  | "COUPANG_SCOUT_AUTH_IP_NOT_ALLOWED"
  | "COUPANG_SCOUT_RESPONSE_CONTRACT_MISMATCH"
  | "COUPANG_SCOUT_API_ERROR"
  | "COUPANG_SCOUT_UNKNOWN_400";

export type CoupangScoutSideEffects = {
  youtube_execute_called: false;
  db_written: false;
  r2_uploaded: false;
  queue_created: false;
};

export type CoupangScoutDiagnostic = {
  ok: boolean;
  classification: CoupangScoutClassification;
  safe_error: string | null;
  endpoint_family: CoupangScoutApiFamily;
  method: "GET";
  blocked_reasons: string[];
  next_auto_action: string | null;
  external_call_allowed: boolean;
  keyword_policy: {
    raw_keyword_printed: false;
    normalized_keyword_present: boolean;
    encoded_keyword_present: boolean;
    attempts_bounded: boolean;
    max_attempts: 3;
  };
  keyword_attempts: Array<{
    label: string;
    normalized_keyword_present: boolean;
    encoded_keyword_present: boolean;
  }>;
  side_effects: CoupangScoutSideEffects;
};

type NormalizeKeywordResult =
  | {
      ok: true;
      normalized_keyword: string;
      encoded_keyword: string;
    }
  | {
      ok: false;
      reason: "empty_keyword" | "keyword_too_short" | "keyword_contains_unsupported_characters";
    };

export const COUPANG_SCOUT_SIDE_EFFECTS: CoupangScoutSideEffects = {
  youtube_execute_called: false,
  db_written: false,
  r2_uploaded: false,
  queue_created: false
};

const PARTNERS_SEARCH_PATH = "/v2/providers/affiliate_open_api/apis/openapi/products/search";
const MAX_KEYWORD_ATTEMPTS = 3;

export function normalizeCoupangScoutKeyword(value: unknown): NormalizeKeywordResult {
  const normalized = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!normalized) {
    return { ok: false, reason: "empty_keyword" };
  }
  if ([...normalized].length < 2) {
    return { ok: false, reason: "keyword_too_short" };
  }
  if (!/^[\p{Script=Hangul}A-Za-z0-9 ]+$/u.test(normalized)) {
    return { ok: false, reason: "keyword_contains_unsupported_characters" };
  }
  return {
    ok: true,
    normalized_keyword: normalized,
    encoded_keyword: encodeURIComponent(normalized)
  };
}

export function buildCoupangScoutRequestContract(input: {
  keyword: unknown;
  api_family?: CoupangScoutApiFamily;
  limit?: unknown;
}) {
  const apiFamily = input.api_family ?? "unknown";
  const keyword = normalizeCoupangScoutKeyword(input.keyword);

  if (apiFamily !== "partners_affiliate") {
    return {
      ok: false,
      classification: "COUPANG_SCOUT_ENDPOINT_FAMILY_MISMATCH" as const,
      safe_error: "Coupang scout requires the partners affiliate API family.",
      endpoint_family: apiFamily,
      method: "GET" as const,
      external_call_allowed: false,
      keyword_policy: keywordPolicy(Boolean(keyword.ok), keyword.ok),
      signing_contract: null,
      side_effects: COUPANG_SCOUT_SIDE_EFFECTS
    };
  }

  if (!keyword.ok) {
    const classification = keyword.reason === "keyword_contains_unsupported_characters"
      ? "COUPANG_SCOUT_KEYWORD_ENCODING_INVALID"
      : "COUPANG_SCOUT_KEYWORD_POLICY_INVALID";
    return {
      ok: false,
      classification,
      safe_error: "Coupang scout request contract rejected the keyword.",
      endpoint_family: apiFamily,
      method: "GET" as const,
      external_call_allowed: false,
      keyword_policy: keywordPolicy(false, false),
      signing_contract: null,
      side_effects: COUPANG_SCOUT_SIDE_EFFECTS
    };
  }

  const limit = normalizeLimit(input.limit);
  const query = `keyword=${keyword.encoded_keyword}&limit=${limit}`;
  return {
    ok: true,
    classification: "COUPANG_SCOUT_READY" as const,
    safe_error: null,
    endpoint_family: apiFamily,
    method: "GET" as const,
    external_call_allowed: true,
    keyword_policy: keywordPolicy(true, true),
    request_contract: {
      host_present: true,
      path_present: true,
      query_present: true,
      raw_url_printed: false,
      auth_header_value_printed: false
    },
    signing_contract: {
      method: "GET" as const,
      path: PARTNERS_SEARCH_PATH,
      query_present: Boolean(query),
      query_includes_question_mark: false,
      raw_hmac_printed: false
    },
    side_effects: COUPANG_SCOUT_SIDE_EFFECTS
  };
}

export function buildCoupangScoutCompatibilityDiagnostic(input: {
  api_family?: CoupangScoutApiFamily;
  keywords?: unknown;
}): CoupangScoutDiagnostic {
  const apiFamily = input.api_family ?? "unknown";
  const rawKeywords = Array.isArray(input.keywords) ? input.keywords : [];
  const attempts = rawKeywords.slice(0, MAX_KEYWORD_ATTEMPTS).map((keyword, index) => {
    const normalized = normalizeCoupangScoutKeyword(keyword);
    return {
      label: `keyword_${index + 1}`,
      normalized_keyword_present: normalized.ok,
      encoded_keyword_present: normalized.ok
    };
  });

  if (apiFamily !== "partners_affiliate") {
    return diagnosticResult({
      ok: false,
      classification: "COUPANG_SCOUT_ENDPOINT_FAMILY_MISMATCH",
      endpoint_family: apiFamily,
      safe_error: "Coupang scout requires the partners affiliate API family.",
      blocked_reasons: ["coupang_scout_endpoint_family_mismatch"],
      next_auto_action: "CONFIGURE_COUPANG_PARTNERS_AFFILIATE_API",
      external_call_allowed: false,
      attempts
    });
  }

  const hasValidKeyword = attempts.some((item) => item.normalized_keyword_present && item.encoded_keyword_present);
  if (!hasValidKeyword) {
    return diagnosticResult({
      ok: false,
      classification: "COUPANG_SCOUT_KEYWORD_POLICY_INVALID",
      endpoint_family: apiFamily,
      safe_error: "Coupang scout requires at least one safe keyword.",
      blocked_reasons: ["coupang_scout_keyword_policy_invalid"],
      next_auto_action: "FIX_COUPANG_SCOUT_KEYWORDS",
      external_call_allowed: false,
      attempts
    });
  }

  return diagnosticResult({
    ok: true,
    classification: "COUPANG_SCOUT_READY",
    endpoint_family: apiFamily,
    safe_error: null,
    blocked_reasons: [],
    next_auto_action: "RUN_APPROVED_SCOUT_DIAGNOSTIC",
    external_call_allowed: true,
    attempts
  });
}

export function classifyCoupangScoutApiResponse(input: {
  http_status: number;
  body: unknown;
}): CoupangScoutDiagnostic {
  const body = isRecord(input.body) ? input.body : {};
  const message = safeTrim(body.message).toLowerCase();
  const code = safeTrim(body.code);

  if (input.http_status >= 200 && input.http_status < 300 && code && code !== "200" && code !== "0") {
    return apiErrorDiagnostic(classifyMessage(message, code));
  }
  if (input.http_status === 401 || input.http_status === 403) {
    return apiErrorDiagnostic(classifyMessage(message, code));
  }
  if (Array.isArray(body.data) || Array.isArray(body.products)) {
    return diagnosticResult({
      ok: true,
      classification: "COUPANG_SCOUT_READY",
      endpoint_family: "partners_affiliate",
      safe_error: null,
      blocked_reasons: [],
      next_auto_action: null,
      external_call_allowed: true,
      attempts: []
    });
  }
  if (input.http_status >= 200 && input.http_status < 300) {
    return apiErrorDiagnostic("COUPANG_SCOUT_RESPONSE_CONTRACT_MISMATCH");
  }
  return apiErrorDiagnostic("COUPANG_SCOUT_API_ERROR");
}

function classifyMessage(message: string, code: string): CoupangScoutClassification {
  if (message.includes("keyword is invalid")) {
    return "COUPANG_SCOUT_KEYWORD_INVALID";
  }
  if (message.includes("invalid signature")) {
    return "COUPANG_SCOUT_AUTH_SIGNATURE_INVALID";
  }
  if (message.includes("signature is expired")) {
    return "COUPANG_SCOUT_AUTH_SIGNATURE_EXPIRED";
  }
  if (message.includes("not allowed ip") || message.includes("ip not allowed")) {
    return "COUPANG_SCOUT_AUTH_IP_NOT_ALLOWED";
  }
  if (code === "400") {
    return "COUPANG_SCOUT_UNKNOWN_400";
  }
  return "COUPANG_SCOUT_API_ERROR";
}

function apiErrorDiagnostic(classification: CoupangScoutClassification) {
  const reason = classification.toLowerCase();
  return diagnosticResult({
    ok: false,
    classification,
    endpoint_family: "partners_affiliate",
    safe_error: safeErrorFor(classification),
    blocked_reasons: [reason],
    next_auto_action: classification.startsWith("COUPANG_SCOUT_AUTH_")
      ? "FIX_COUPANG_SCOUT_AUTH_CONTRACT"
      : "FIX_COUPANG_SCOUT_REQUEST_CONTRACT",
    external_call_allowed: false,
    attempts: []
  });
}

function safeErrorFor(classification: CoupangScoutClassification) {
  switch (classification) {
    case "COUPANG_SCOUT_KEYWORD_INVALID":
      return "Coupang scout request contract rejected the keyword.";
    case "COUPANG_SCOUT_AUTH_SIGNATURE_INVALID":
      return "Coupang scout authentication signature was rejected.";
    case "COUPANG_SCOUT_AUTH_SIGNATURE_EXPIRED":
      return "Coupang scout authentication signature expired.";
    case "COUPANG_SCOUT_AUTH_IP_NOT_ALLOWED":
      return "Coupang scout caller IP is not allowed for this credential.";
    case "COUPANG_SCOUT_RESPONSE_CONTRACT_MISMATCH":
      return "Coupang scout response contract was not recognized.";
    default:
      return "Coupang scout request failed with a safe classified error.";
  }
}

function diagnosticResult(input: {
  ok: boolean;
  classification: CoupangScoutClassification;
  endpoint_family: CoupangScoutApiFamily;
  safe_error: string | null;
  blocked_reasons: string[];
  next_auto_action: string | null;
  external_call_allowed: boolean;
  attempts: CoupangScoutDiagnostic["keyword_attempts"];
}): CoupangScoutDiagnostic {
  const hasNormalizedKeyword = input.attempts.some((item) => item.normalized_keyword_present);
  const hasEncodedKeyword = input.attempts.some((item) => item.encoded_keyword_present);
  return {
    ok: input.ok,
    classification: input.classification,
    safe_error: input.safe_error,
    endpoint_family: input.endpoint_family,
    method: "GET",
    blocked_reasons: input.blocked_reasons,
    next_auto_action: input.next_auto_action,
    external_call_allowed: input.external_call_allowed,
    keyword_policy: {
      raw_keyword_printed: false,
      normalized_keyword_present: hasNormalizedKeyword,
      encoded_keyword_present: hasEncodedKeyword,
      attempts_bounded: input.attempts.length <= MAX_KEYWORD_ATTEMPTS,
      max_attempts: MAX_KEYWORD_ATTEMPTS
    },
    keyword_attempts: input.attempts,
    side_effects: COUPANG_SCOUT_SIDE_EFFECTS
  };
}

function keywordPolicy(normalized: boolean, encoded: boolean) {
  return {
    raw_keyword_printed: false as const,
    normalized_keyword_present: normalized,
    encoded_keyword_present: encoded,
    attempts_bounded: true,
    max_attempts: MAX_KEYWORD_ATTEMPTS
  };
}

function normalizeLimit(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return 10;
  }
  return Math.max(1, Math.min(10, Math.floor(numeric)));
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
