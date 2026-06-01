import { createHash } from "node:crypto";
import type { ProductCandidate } from "@/types/automation";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "spm"
]);

const SECRET_KEY_PATTERN = /(secret|token|authorization|password|api[_-]?key|access[_-]?key)/i;

export function createCandidateProductKey(candidate: ProductCandidate): string {
  const platform = detectCandidatePlatform(candidate);
  const payload = candidate.payload ?? {};

  if (platform === "coupang") {
    const productId = payloadString(payload, ["productId", "product_id"]) || extractCoupangProductId(candidate.raw_coupang_url);
    const itemId = payloadString(payload, ["itemId", "item_id"]);
    const vendorItemId = payloadString(payload, ["vendorItemId", "vendor_item_id"]);
    if (productId || itemId || vendorItemId) {
      return ["coupang", productId, itemId, vendorItemId].map((value) => normalizeKeyPart(value || "unknown")).join(":");
    }
  }

  if (platform === "musinsa") {
    const goodsNo =
      payloadString(payload, ["goods_no", "goodsNo", "goods_id"]) || extractMusinsaGoodsNo(candidate.raw_coupang_url);
    if (goodsNo) {
      return `musinsa:${normalizeKeyPart(goodsNo)}`;
    }
  }

  const source = normalizeKeyPart(platform || payloadString(payload, ["source", "platform", "source_name"]) || "unknown");
  const urlHash = hashString(normalizeCandidateUrl(candidate.raw_coupang_url || candidate.selected_affiliate_url));
  const nameHash = hashString(normalizeCandidateText(candidate.product_name));
  return `${source}:${urlHash}:${nameHash}`;
}

export function detectCandidatePlatform(candidate: ProductCandidate): string {
  const payloadPlatform = payloadString(candidate.payload ?? {}, ["platform", "source", "source_name"]).toLowerCase();
  if (payloadPlatform.includes("coupang")) {
    return "coupang";
  }
  if (payloadPlatform.includes("musinsa")) {
    return "musinsa";
  }
  if (payloadPlatform.includes("toss")) {
    return "toss";
  }

  const url = `${candidate.raw_coupang_url} ${candidate.selected_affiliate_url}`.toLowerCase();
  if (url.includes("coupang.com") || url.includes("link.coupang.com")) {
    return "coupang";
  }
  if (url.includes("musinsa.com")) {
    return "musinsa";
  }
  if (url.includes("toss")) {
    return "toss";
  }
  return payloadPlatform || "unknown";
}

export function normalizeCandidateText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeCandidateUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const url = new URL(trimmed);
    [...url.searchParams.keys()].forEach((key) => {
      if (key.toLowerCase().startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    });
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\?$/, "");
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

export function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function payloadString(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (SECRET_KEY_PATTERN.test(key)) {
      continue;
    }
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return "";
}

function normalizeKeyPart(value: string): string {
  return normalizeCandidateText(value).replace(/[^a-z0-9가-힣_-]+/gi, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function extractCoupangProductId(value: string) {
  return value.match(/\/(?:vp\/)?products\/(\d+)/i)?.[1] ?? "";
}

function extractMusinsaGoodsNo(value: string) {
  return value.match(/\/(?:products|goods)\/(\d+)/i)?.[1] ?? "";
}
