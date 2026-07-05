import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildCoupangPartnersSearchRequest,
  type CoupangPartnersEnvReadiness
} from "../../lib/coupang/partnersAuthConfig";
import {
  requestCoupangDeeplinkAffiliateUrls,
  type CoupangDeeplinkCredentialsReadiness
} from "../coupang/coupangDeeplinkClient";

export type V088CoupangProductSourceResolverBlocker =
  | "BLOCKED_V088_PRODUCT_QUERY_MISSING"
  | "BLOCKED_V088_COUPANG_ACCESS_KEY_MISSING"
  | "BLOCKED_V088_COUPANG_SECRET_KEY_MISSING"
  | "BLOCKED_V088_COUPANG_PROVIDER_DISABLED"
  | "BLOCKED_V088_COUPANG_CUSTOMER_OR_PARTNER_ID_MISSING"
  | "BLOCKED_V088_COUPANG_PRODUCT_SEARCH_FAILED"
  | "BLOCKED_V088_COUPANG_PRODUCT_CANDIDATE_NOT_FOUND"
  | "BLOCKED_V088_COUPANG_RAW_URL_MISSING"
  | "BLOCKED_V088_COUPANG_DEEPLINK_FAILED"
  | "BLOCKED_V088_COUPANG_AFFILIATE_URL_MISSING"
  | "BLOCKED_V088_LOCAL_MANIFEST_MISSING"
  | "BLOCKED_V088_LOCAL_MANIFEST_WRITE_FAILED"
  | "BLOCKED_V088_UNSAFE_REPORT_REQUESTED";

export type V088CoupangProductSourceResolverReport = {
  version: "v088";
  status: "blocked" | "bound";
  mode: "coupang_api_product_source_resolution_no_upload";
  selectedChannelKey: "father_jobs";
  blockers: V088CoupangProductSourceResolverBlocker[];
  credentials: {
    search: CoupangPartnersEnvReadiness;
    deeplink: CoupangDeeplinkCredentialsReadiness;
  };
  productQueryPresent: boolean;
  productQueryHashPrefix: string | null;
  productSearchApiCalled: boolean;
  deeplinkApiCalled: boolean;
  productCandidateFound: boolean;
  productCandidateHashPrefix: string | null;
  rawCoupangUrlPresent: boolean;
  rawCoupangUrlHashPrefix: string | null;
  affiliateUrlPresent: boolean;
  affiliateUrlHashPrefix: string | null;
  localManifestPresent: boolean;
  localManifestWritten: boolean;
  rawUrlsPrinted: false;
  rawFilePathsPrinted: false;
  rawVideoIdsPrinted: false;
  rawChannelIdsPrinted: false;
  secretsPrinted: false;
  authorizationHeaderPrinted: false;
  hmacSignaturePrinted: false;
  v084ExecuteCalled: false;
  videosInsertCalled: false;
  commentThreadsInsertCalled: false;
  visibilityChanged: false;
  R2Upload: false;
  DBWrite: false;
  productAssetsWrite: false;
  n8nWebhookCalled: false;
  fakeSuccess: false;
  safeToUpload: false;
  safeToPublicUpload: false;
};

export type V088CoupangProductSourceResolverInput = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  manifestPath?: string;
  channelKey?: "father_jobs";
  fetchImpl?: typeof fetch;
  deeplinkFetchImpl?: typeof fetch;
  unsafeReportRequested?: boolean;
};

type ProductCandidate = {
  productName: string | null;
  rawCoupangUrl: string | null;
};

const DEFAULT_MANIFEST_PATH = path.join(
  "commerce-assets",
  "review",
  "v057",
  "father_jobs",
  "product-source-v057.local.json"
);

export async function resolveV088CoupangProductSource(
  input: V088CoupangProductSourceResolverInput = {}
): Promise<V088CoupangProductSourceResolverReport> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const manifestPath = path.resolve(cwd, input.manifestPath ?? env.V088_PRODUCT_SOURCE_MANIFEST_PATH ?? DEFAULT_MANIFEST_PATH);
  const blockers: V088CoupangProductSourceResolverBlocker[] = [];

  if (input.unsafeReportRequested) blockers.push("BLOCKED_V088_UNSAFE_REPORT_REQUESTED");

  const existingManifest = await readJson(manifestPath);
  if (!existingManifest) blockers.push("BLOCKED_V088_LOCAL_MANIFEST_MISSING");

  const productQuery = trimOrNull(readField(existingManifest, ["productName", "product_name"]));
  if (!productQuery) blockers.push("BLOCKED_V088_PRODUCT_QUERY_MISSING");

  const searchRequest = buildCoupangPartnersSearchRequest({
    env,
    keyword: productQuery ?? "",
    limit: 10
  });
  const deeplinkCredentials = resolveDeeplinkCredentials(env);
  const readinessBlocker = mapSearchReadinessBlocker(searchRequest.blocker);
  if (readinessBlocker) blockers.push(readinessBlocker);

  let productSearchApiCalled = false;
  let deeplinkApiCalled = false;
  let productCandidate: ProductCandidate | null = null;
  let affiliateUrl: string | null = null;

  if (blockers.length === 0 && searchRequest.ok) {
    try {
      productSearchApiCalled = true;
      const response = await (input.fetchImpl ?? fetch)(searchRequest.request.url, {
        method: searchRequest.request.method,
        headers: searchRequest.request.headers
      });
      if (!response.ok) {
        blockers.push("BLOCKED_V088_COUPANG_PRODUCT_SEARCH_FAILED");
      } else {
        const payload = await response.json();
        productCandidate = selectProductCandidate(payload, productQuery!);
        if (!productCandidate) {
          blockers.push("BLOCKED_V088_COUPANG_PRODUCT_CANDIDATE_NOT_FOUND");
        } else if (!productCandidate.rawCoupangUrl) {
          blockers.push("BLOCKED_V088_COUPANG_RAW_URL_MISSING");
        }
      }
    } catch {
      blockers.push("BLOCKED_V088_COUPANG_PRODUCT_SEARCH_FAILED");
    }
  }

  if (blockers.length === 0 && productCandidate?.rawCoupangUrl) {
    const deeplink = await requestCoupangDeeplinkAffiliateUrls({
      rawCoupangUrls: [productCandidate.rawCoupangUrl],
      env,
      fetchImpl: input.deeplinkFetchImpl ?? input.fetchImpl
    });
    deeplinkApiCalled = deeplink.external_api_called;
    if (!deeplink.ok) {
      blockers.push(deeplink.blocker === "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING"
        ? "BLOCKED_V088_COUPANG_ACCESS_KEY_MISSING"
        : "BLOCKED_V088_COUPANG_DEEPLINK_FAILED");
    } else {
      affiliateUrl = deeplink.affiliateUrls[0] ?? null;
      if (!isHttpsCoupangUrl(affiliateUrl)) {
        blockers.push("BLOCKED_V088_COUPANG_AFFILIATE_URL_MISSING");
      }
    }
  }

  let localManifestWritten = false;
  if (blockers.length === 0 && existingManifest && productCandidate?.rawCoupangUrl && affiliateUrl) {
    try {
      await fs.writeFile(manifestPath, `${JSON.stringify({
        ...existingManifest,
        productName: productCandidate.productName || productQuery,
        rawCoupangUrl: productCandidate.rawCoupangUrl,
        selectedAffiliateUrl: affiliateUrl
      }, null, 2)}\n`, "utf8");
      localManifestWritten = true;
    } catch {
      blockers.push("BLOCKED_V088_LOCAL_MANIFEST_WRITE_FAILED");
    }
  }

  return {
    version: "v088",
    status: blockers.length === 0 ? "bound" : "blocked",
    mode: "coupang_api_product_source_resolution_no_upload",
    selectedChannelKey: "father_jobs",
    blockers: [...new Set(blockers)],
    credentials: {
      search: searchRequest.safe_summary,
      deeplink: deeplinkCredentials
    },
    productQueryPresent: Boolean(productQuery),
    productQueryHashPrefix: hashPrefix(productQuery),
    productSearchApiCalled,
    deeplinkApiCalled,
    productCandidateFound: Boolean(productCandidate),
    productCandidateHashPrefix: hashPrefix(productCandidate?.productName),
    rawCoupangUrlPresent: Boolean(productCandidate?.rawCoupangUrl),
    rawCoupangUrlHashPrefix: hashPrefix(productCandidate?.rawCoupangUrl),
    affiliateUrlPresent: Boolean(affiliateUrl),
    affiliateUrlHashPrefix: hashPrefix(affiliateUrl),
    localManifestPresent: Boolean(existingManifest),
    localManifestWritten,
    rawUrlsPrinted: false,
    rawFilePathsPrinted: false,
    rawVideoIdsPrinted: false,
    rawChannelIdsPrinted: false,
    secretsPrinted: false,
    authorizationHeaderPrinted: false,
    hmacSignaturePrinted: false,
    v084ExecuteCalled: false,
    videosInsertCalled: false,
    commentThreadsInsertCalled: false,
    visibilityChanged: false,
    R2Upload: false,
    DBWrite: false,
    productAssetsWrite: false,
    n8nWebhookCalled: false,
    fakeSuccess: false,
    safeToUpload: false,
    safeToPublicUpload: false
  };
}

async function readJson(filePath: string) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function selectProductCandidate(payload: unknown, query: string): ProductCandidate | null {
  const candidates = collectObjects(payload)
    .map(normalizeProductCandidate)
    .filter((item): item is ProductCandidate => Boolean(item.rawCoupangUrl && isHttpsCoupangUrl(item.rawCoupangUrl)));
  if (candidates.length === 0) return null;
  const normalizedQuery = normalizeText(query);
  return candidates.find((item) => item.productName && normalizeText(item.productName).includes(normalizedQuery)) ??
    candidates[0] ??
    null;
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectObjects);
  const record = value as Record<string, unknown>;
  return [
    record,
    ...Object.values(record).flatMap(collectObjects)
  ];
}

function normalizeProductCandidate(record: Record<string, unknown>): ProductCandidate {
  const productName = trimOrNull(readField(record, [
    "productName",
    "product_name",
    "title",
    "name"
  ]));
  const rawCoupangUrl = trimOrNull(readField(record, [
    "productUrl",
    "product_url",
    "landingUrl",
    "landing_url",
    "originalUrl",
    "original_url",
    "url"
  ]));
  return { productName, rawCoupangUrl };
}

function readField(record: Record<string, unknown> | null, keys: string[]) {
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function mapSearchReadinessBlocker(blocker: string | null): V088CoupangProductSourceResolverBlocker | null {
  switch (blocker) {
    case "COUPANG_PARTNERS_PROVIDER_DISABLED":
      return "BLOCKED_V088_COUPANG_PROVIDER_DISABLED";
    case "COUPANG_PARTNERS_ACCESS_KEY_MISSING":
      return "BLOCKED_V088_COUPANG_ACCESS_KEY_MISSING";
    case "COUPANG_PARTNERS_SECRET_KEY_MISSING":
      return "BLOCKED_V088_COUPANG_SECRET_KEY_MISSING";
    case "COUPANG_PARTNERS_CUSTOMER_OR_PARTNER_ID_MISSING":
      return "BLOCKED_V088_COUPANG_CUSTOMER_OR_PARTNER_ID_MISSING";
    case "COUPANG_PARTNERS_KEYWORD_MISSING":
      return "BLOCKED_V088_PRODUCT_QUERY_MISSING";
    default:
      return null;
  }
}

function resolveDeeplinkCredentials(env: Record<string, string | undefined>): CoupangDeeplinkCredentialsReadiness {
  return {
    access_key_present: Boolean(firstPresent(env.COUPANG_PARTNERS_ACCESS_KEY, env.COUPANG_ACCESS_KEY)),
    secret_key_present: Boolean(firstPresent(env.COUPANG_PARTNERS_SECRET_KEY, env.COUPANG_SECRET_KEY)),
    base_url_configured: Boolean(firstPresent(env.COUPANG_PARTNERS_BASE_URL)),
    raw_values_masked: true
  };
}

function isHttpsCoupangUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      (url.hostname === "coupang.com" || url.hostname.endsWith(".coupang.com")) &&
      !url.hostname.includes("example");
  } catch {
    return false;
  }
}

function hashPrefix(value: string | null | undefined) {
  return value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 12) : null;
}

function firstPresent(...values: Array<string | undefined>) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function trimOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}
