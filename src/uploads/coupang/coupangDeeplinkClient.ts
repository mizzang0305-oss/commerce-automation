import {
  COUPANG_PARTNERS_API_HOST,
  buildCoupangPartnersSignature,
  buildCoupangSignedDate
} from "../../lib/coupang/partnersAuthConfig";

export const COUPANG_DEEPLINK_PATH = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink";
export const COUPANG_DEEPLINK_METHOD = "POST";

export type CoupangDeeplinkCredentialsReadiness = {
  access_key_present: boolean;
  secret_key_present: boolean;
  base_url_configured: boolean;
  raw_values_masked: true;
};

export type CoupangDeeplinkClientBlocker =
  | "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING"
  | "BLOCKED_V066_COUPANG_DEEPLINK_FAILED";

export type CoupangDeeplinkClientResult =
  | {
    ok: true;
    blocker: null;
    external_api_called: true;
    affiliateUrls: string[];
    credentials: CoupangDeeplinkCredentialsReadiness;
    raw_urls_printed: false;
    secrets_printed: false;
    auth_header_printed: false;
  }
  | {
    ok: false;
    blocker: CoupangDeeplinkClientBlocker;
    external_api_called: boolean;
    affiliateUrls: string[];
    credentials: CoupangDeeplinkCredentialsReadiness;
    raw_urls_printed: false;
    secrets_printed: false;
    auth_header_printed: false;
  };

type ResolvedDeeplinkEnv = {
  accessKey: string | null;
  secretKey: string | null;
  baseUrl: string;
  readiness: CoupangDeeplinkCredentialsReadiness;
};

type DeeplinkResponseItem = {
  shortenUrl?: unknown;
  landingUrl?: unknown;
};

export async function requestCoupangDeeplinkAffiliateUrls(input: {
  rawCoupangUrls: string[];
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  signedDate?: string;
}): Promise<CoupangDeeplinkClientResult> {
  const env = resolveCoupangDeeplinkEnv(input.env ?? process.env);
  if (!env.accessKey || !env.secretKey) {
    return blocked("BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING", false, [], env.readiness);
  }

  try {
    const signedDate = input.signedDate ?? buildCoupangSignedDate(new Date());
    const authorization = buildCoupangDeeplinkAuthorization({
      accessKey: env.accessKey,
      secretKey: env.secretKey,
      signedDate
    });
    const response = await (input.fetchImpl ?? fetch)(`${env.baseUrl}${COUPANG_DEEPLINK_PATH}`, {
      method: COUPANG_DEEPLINK_METHOD,
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ coupangUrls: input.rawCoupangUrls })
    });

    if (!response.ok) {
      return blocked("BLOCKED_V066_COUPANG_DEEPLINK_FAILED", true, [], env.readiness);
    }

    const payload = await response.json();
    const affiliateUrls = normalizeDeeplinkResponse(payload);
    if (affiliateUrls.length < input.rawCoupangUrls.length) {
      return blocked("BLOCKED_V066_COUPANG_DEEPLINK_FAILED", true, affiliateUrls, env.readiness);
    }

    return {
      ok: true,
      blocker: null,
      external_api_called: true,
      affiliateUrls: affiliateUrls.slice(0, input.rawCoupangUrls.length),
      credentials: env.readiness,
      raw_urls_printed: false,
      secrets_printed: false,
      auth_header_printed: false
    };
  } catch {
    return blocked("BLOCKED_V066_COUPANG_DEEPLINK_FAILED", true, [], env.readiness);
  }
}

export function resolveCoupangDeeplinkEnv(env: Record<string, string | undefined> = process.env): ResolvedDeeplinkEnv {
  const accessKey = firstPresent(env.COUPANG_PARTNERS_ACCESS_KEY, env.COUPANG_ACCESS_KEY);
  const secretKey = firstPresent(env.COUPANG_PARTNERS_SECRET_KEY, env.COUPANG_SECRET_KEY);
  const configuredBaseUrl = firstPresent(env.COUPANG_PARTNERS_BASE_URL);
  const baseUrl = normalizeBaseUrl(configuredBaseUrl) ?? COUPANG_PARTNERS_API_HOST;

  return {
    accessKey,
    secretKey,
    baseUrl,
    readiness: {
      access_key_present: Boolean(accessKey),
      secret_key_present: Boolean(secretKey),
      base_url_configured: Boolean(configuredBaseUrl),
      raw_values_masked: true
    }
  };
}

function buildCoupangDeeplinkAuthorization(input: {
  accessKey: string;
  secretKey: string;
  signedDate: string;
}) {
  const signature = buildCoupangPartnersSignature({
    secretKey: input.secretKey,
    signedDate: input.signedDate,
    method: COUPANG_DEEPLINK_METHOD,
    path: COUPANG_DEEPLINK_PATH,
    query: ""
  });
  return [
    "CEA algorithm=HmacSHA256",
    `access-key=${input.accessKey}`,
    `signed-date=${input.signedDate}`,
    `signature=${signature}`
  ].join(", ");
}

function normalizeDeeplinkResponse(payload: unknown) {
  const data = Array.isArray((payload as { data?: unknown }).data)
    ? (payload as { data: unknown[] }).data
    : [];
  return data
    .map((item) => normalizeDeeplinkResponseItem(item))
    .filter((value): value is string => Boolean(value));
}

function normalizeDeeplinkResponseItem(item: unknown) {
  const row = item as DeeplinkResponseItem;
  return safeTrim(row.shortenUrl) || safeTrim(row.landingUrl);
}

function blocked(
  blocker: CoupangDeeplinkClientBlocker,
  externalApiCalled: boolean,
  affiliateUrls: string[],
  credentials: CoupangDeeplinkCredentialsReadiness
): CoupangDeeplinkClientResult {
  return {
    ok: false,
    blocker,
    external_api_called: externalApiCalled,
    affiliateUrls,
    credentials,
    raw_urls_printed: false,
    secrets_printed: false,
    auth_header_printed: false
  };
}

function firstPresent(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeBaseUrl(value: string | null) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.origin.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
