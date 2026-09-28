import { buildLiveProductKeywordContexts, normalizeLiveProduct, rankLiveProducts, searchLiveCoupangProducts, supportsUsageEvidence } from "@/lib/live-product-video";
import type { LiveProductCandidate } from "@/lib/live-product-video";

const IMAGE_HOSTS = new Set(["thumbnail.coupangcdn.com", "image.coupangcdn.com", "ads-partners.coupang.com"]);
const MAX_PAGE_BYTES = 4 * 1024 * 1024;

export async function scoutFreshImageCandidates(input: {
  excludedProductIds: string[];
  limit: number;
  env: Readonly<Record<string, string | undefined>>;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<{ candidates: LiveProductCandidate[]; searchCalls: number; rawProductsFound: number }> {
  const { contexts } = buildLiveProductKeywordContexts(input.now);
  const results = [];
  for (const context of contexts.slice(0, 3)) {
    results.push(await searchLiveCoupangProducts({ context, limit: 6, env: { ...input.env }, fetchImpl: input.fetchImpl, now: input.now }));
  }
  const raw = results.flatMap((result) => result.products);
  const normalized = raw.flatMap((row) => {
    try {
      const candidate = normalizeLiveProduct(row);
      return /^coupang:product:\d+:item:\d+:vendor:\d+$/u.test(candidate.productKey) ? [candidate] : [];
    } catch { return []; }
  });
  const ranked = rankLiveProducts({ candidates: normalized, keywordContexts: contexts, usageEvidenceAvailable: supportsUsageEvidence });
  const excluded = new Set(input.excludedProductIds);
  const excludedPageKeys = new Set(input.excludedProductIds.flatMap((id) => {
    const match = /^coupang:product:(\d+):item:\d+:vendor:\d+$/u.exec(id);
    return match ? [match[1]] : [];
  }));
  const candidates = ranked.filter(({ candidate, score }) =>
    score.eligible && !excluded.has(candidate.productKey) &&
    !excludedPageKeys.has(candidate.productKey.split(":")[2]) &&
    (candidate.useCase === "vehicle_organization" || candidate.useCase === "laundry_drying")
  ).slice(0, input.limit).map(({ candidate }) => candidate);
  return { candidates, searchCalls: results.reduce((sum, result) => sum + result.apiCallCount, 0), rawProductsFound: raw.length };
}

export async function readExactProductPageImages(input: {
  rawProductUrl: string;
  productId: string;
  fetchImpl?: typeof fetch;
}): Promise<string[]> {
  const ids = /^coupang:product:(\d+):item:(\d+):vendor:(\d+)$/u.exec(input.productId);
  if (!ids) return [];
  let requested: URL;
  try { requested = new URL(input.rawProductUrl); } catch { return []; }
  if (!sameExactProduct(requested, ids)) return [];
  try {
    const response = await (input.fetchImpl ?? fetch)(requested, { method: "GET", redirect: "manual" });
    if (!response.ok || !response.url || !sameExactProduct(new URL(response.url), ids)) return [];
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    const length = Number(response.headers.get("content-length") ?? "0");
    if (!contentType.includes("text/html") || length > MAX_PAGE_BYTES) return [];
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES) return [];
    return extractStructuredProductImages(html, requested.toString());
  } catch { return []; }
}

export function extractStructuredProductImages(html: string, exactProductUrl: string): string[] {
  const selected = new URL(exactProductUrl);
  const images: string[] = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu);
  for (const script of scripts) {
    if (!/\btype\s*=\s*["']application\/ld\+json["']/iu.test(script[1])) continue;
    let payload: unknown;
    try { payload = JSON.parse(script[2]); } catch { continue; }
    const nodes = Array.isArray(payload) ? payload : [payload];
    for (const node of nodes) {
      const records = isRecord(node) && Array.isArray(node["@graph"]) ? node["@graph"] : [node];
      for (const record of records) {
        if (!isRecord(record)) continue;
        const types = Array.isArray(record["@type"]) ? record["@type"] : [record["@type"]];
        if (!types.includes("Product")) continue;
        if (typeof record.url !== "string") continue;
        try {
          const url = new URL(record.url);
          if (url.protocol !== "https:" || url.hostname !== "www.coupang.com" || url.pathname !== selected.pathname ||
            (url.searchParams.has("itemId") && url.searchParams.get("itemId") !== selected.searchParams.get("itemId")) ||
            (url.searchParams.has("vendorItemId") && url.searchParams.get("vendorItemId") !== selected.searchParams.get("vendorItemId"))) continue;
        } catch { continue; }
        const refs = Array.isArray(record.image) ? record.image : [record.image];
        for (const ref of refs) {
          const value = typeof ref === "string" ? ref : isRecord(ref) ? ref.url ?? ref.contentUrl : undefined;
          if (typeof value !== "string") continue;
          try {
            const url = new URL(value);
            if (url.protocol === "https:" && IMAGE_HOSTS.has(url.hostname)) images.push(url.toString());
          } catch { /* ignore malformed public metadata */ }
        }
      }
    }
  }
  return [...new Set(images)];
}

function sameExactProduct(url: URL, ids: RegExpExecArray) {
  return url.protocol === "https:" && url.hostname === "www.coupang.com" &&
    url.pathname === `/vp/products/${ids[1]}` &&
    url.searchParams.get("itemId") === ids[2] && url.searchParams.get("vendorItemId") === ids[3];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
