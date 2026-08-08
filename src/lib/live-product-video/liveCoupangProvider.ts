import { createHash } from "node:crypto";
import { buildCoupangPartnersSearchRequest, readCoupangPartnersEnv } from "@/lib/coupang/partnersAuthConfig";
import {
  isLikelyCoupangProductUrl,
  materializeCoupangProductUrlFromAffiliate,
  validateAffiliateUrl
} from "@/lib/coupang/coupangUrl";
import { validateCandidateImageUrl } from "@/lib/coupang/coupangImage";
import { requestCoupangDeeplinkAffiliateUrls } from "@/uploads/coupang/coupangDeeplinkClient";
import type { LiveCoupangProviderProduct, LiveProductKeywordContext } from "./types";

export type LiveCoupangProviderResult = {
  ok: boolean;
  configured: boolean;
  blocker: string | null;
  products: LiveCoupangProviderProduct[];
  apiCallCount: number;
  searchApiCalled: boolean;
  deeplinkApiCalled: boolean;
  credentialsExposed: false;
  authorizationHeadersExposed: false;
};

export async function searchLiveCoupangProducts(input: {
  context: LiveProductKeywordContext;
  limit: number;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: Date;
  allowDeeplink?: boolean;
}): Promise<LiveCoupangProviderResult> {
  const env = input.env ?? process.env;
  const readiness = readCoupangPartnersEnv(env).readiness;
  const configured = readiness.provider_enabled && readiness.access_key_present && readiness.secret_key_present && readiness.customer_id_or_partner_id_present;
  const request = buildCoupangPartnersSearchRequest({ env, keyword: input.context.keyword, limit: input.limit });
  if (!request.ok) return blocked(request.blocker, configured, 0, false, false);

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(request.request.url, {
      method: request.request.method,
      headers: request.request.headers
    });
  } catch {
    return blocked("COUPANG_PARTNERS_SEARCH_NETWORK_FAILED", configured, 1, true, false);
  }
  if (!response.ok) return blocked(`COUPANG_PARTNERS_SEARCH_HTTP_${response.status}`, configured, 1, true, false);

  let rows: Record<string, unknown>[];
  try {
    rows = extractProductRows(await response.json());
  } catch {
    return blocked("COUPANG_PARTNERS_SEARCH_RESPONSE_INVALID", configured, 1, true, false);
  }
  if (rows.length === 0) return blocked("COUPANG_PARTNERS_SEARCH_EMPTY", configured, 1, true, false);

  const discoveredAt = (input.now ?? new Date()).toISOString();
  const requestMarker = `search-${createHash("sha256").update(`${input.context.keyword}:${discoveredAt}`).digest("hex").slice(0, 12)}`;
  const pending = rows.slice(0, Math.max(1, Math.min(10, input.limit))).map((row) => normalizeProviderRow(row, {
    context: input.context,
    requestMarker,
    discoveredAt
  })).filter((value): value is LiveCoupangProviderProduct => Boolean(value));
  const missingAffiliate = pending.filter((product) => !product.selectedAffiliateUrl && isLikelyCoupangProductUrl(product.rawProductUrl));
  let deeplinkApiCalled = false;
  let apiCallCount = 1;
  if (missingAffiliate.length > 0 && input.allowDeeplink !== false) {
    const deeplink = await requestCoupangDeeplinkAffiliateUrls({
      rawCoupangUrls: missingAffiliate.map((product) => product.rawProductUrl),
      env,
      fetchImpl: input.fetchImpl
    });
    deeplinkApiCalled = deeplink.external_api_called;
    if (deeplink.external_api_called) apiCallCount += 1;
    if (deeplink.ok) {
      for (const [index, product] of missingAffiliate.entries()) product.selectedAffiliateUrl = deeplink.affiliateUrls[index] ?? "";
    }
  }
  return {
    ok: pending.length > 0,
    configured,
    blocker: pending.length > 0 ? null : "COUPANG_PARTNERS_PRODUCTS_INVALID",
    products: pending,
    apiCallCount,
    searchApiCalled: true,
    deeplinkApiCalled,
    credentialsExposed: false,
    authorizationHeadersExposed: false
  };
}

function normalizeProviderRow(
  row: Record<string, unknown>,
  input: { context: LiveProductKeywordContext; requestMarker: string; discoveredAt: string }
): LiveCoupangProviderProduct | null {
  const rawProductName = readString(row, ["productName", "product_name", "title", "name"]);
  const productUrl = readString(row, ["productUrl", "product_url", "landingUrl", "landing_url", "url"]);
  const affiliate = validateAffiliateUrl(productUrl);
  const rawProductUrl = isLikelyCoupangProductUrl(productUrl)
    ? productUrl
    : materializeCoupangProductUrlFromAffiliate(affiliate.normalized_url);
  const productImage = readString(row, ["productImage", "product_image", "productImageUrl", "imageUrl", "image_url", "thumbnailUrl"]);
  const image = validateCandidateImageUrl(productImage);
  if (!rawProductName || !rawProductUrl) return null;
  return {
    rawProductId: readScalar(row, ["productId", "product_id", "pageKey"]),
    rawProductName,
    category: readString(row, ["categoryName", "category", "category_name"]),
    categoryPath: readString(row, ["categoryPath", "category_path", "categoryName", "category"]),
    priceText: readScalar(row, ["productPrice", "product_price", "price"]),
    rawProductUrl,
    selectedAffiliateUrl: affiliate.ok ? affiliate.normalized_url : "",
    productImageUrls: image.ok ? [image.normalized_url] : [],
    sourceProvider: "coupang_partners_product_search",
    sourceRequestId: input.requestMarker,
    discoveredAt: input.discoveredAt,
    sourceKeyword: input.context.keyword,
    eventContext: { eventId: input.context.eventId, eventName: input.context.eventName }
  };
}

function extractProductRows(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as { data?: unknown }).data;
  if (Array.isArray(data)) return data.filter(isRecord);
  if (isRecord(data) && Array.isArray(data.productData)) return data.productData.filter(isRecord);
  return [];
}

function readString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) if (typeof row[key] === "string" && row[key].trim()) return row[key].trim();
  return "";
}

function readScalar(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) return String(value).trim();
  }
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function blocked(blocker: string, configured: boolean, apiCallCount: number, searchApiCalled: boolean, deeplinkApiCalled: boolean): LiveCoupangProviderResult {
  return { ok: false, configured, blocker, products: [], apiCallCount, searchApiCalled, deeplinkApiCalled, credentialsExposed: false, authorizationHeadersExposed: false };
}
