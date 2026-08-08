import { createHash } from "node:crypto";
import { buildCoupangProductKey, extractCoupangProductId, extractCoupangUrlIds } from "@/lib/coupang/coupangUrl";
import type { LiveCoupangProviderProduct, LiveProductCandidate, LiveProductUseCase } from "./types";
import { aliasForUseCase, anchorsForUseCase, classifyUsageEvidenceUseCase } from "@/lib/usage-evidence";

const PROMOTION_PREFIX = /^(?:\[[^\]]{1,24}\]|\([^)]{1,24}\)|로켓배송|무료배송|쿠팡추천|오늘출발)\s*/gu;
const OPTION_SUFFIX = /\s*[,/|]\s*(?:색상|컬러|옵션|수량|사이즈|타입)\s*[:：]?.*$/u;

export function normalizeLiveProduct(input: LiveCoupangProviderProduct): LiveProductCandidate {
  const canonicalProductName = normalizeCanonicalProductName(input.rawProductName);
  const useCase = classifyUsageEvidenceUseCase({ productName: canonicalProductName, categoryPath: input.categoryPath, sourceKeyword: input.sourceKeyword }).useCase;
  const rawIds = extractCoupangUrlIds(input.rawProductUrl);
  const rawProductId = input.rawProductId || extractCoupangProductId(input.rawProductUrl);
  const productKey = buildCoupangProductKey({
    raw_coupang_url: input.rawProductUrl,
    product_id: rawProductId,
    item_id: rawIds.item_id,
    vendor_item_id: rawIds.vendor_item_id
  });
  return {
    ...input,
    rawProductId,
    candidateId: `live-${createHash("sha256").update(productKey).digest("hex").slice(0, 16)}`,
    productKey,
    canonicalProductName,
    productAliases: buildAliases(canonicalProductName, useCase),
    productAnchors: buildAnchors(canonicalProductName, useCase),
    useCase
  };
}

export function normalizeCanonicalProductName(value: string): string {
  let normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  for (let index = 0; index < 3; index += 1) normalized = normalized.replace(PROMOTION_PREFIX, "").trim();
  normalized = normalized.replace(OPTION_SUFFIX, "").replace(/\s+(?:\d+\s*(?:개입|개|팩))$/u, "").trim();
  if (!normalized) throw new Error("LIVE_PRODUCT_NAME_INVALID");
  return normalized.slice(0, 60).trim();
}

export function classifyLiveProductUseCase(value: string): LiveProductUseCase {
  return classifyUsageEvidenceUseCase({ productName: value }).useCase;
}

function buildAnchors(name: string, useCase: LiveProductUseCase): string[] {
  const nameTokens = name.match(/[가-힣A-Za-z0-9]{2,}/gu) ?? [];
  return unique([...anchorsForUseCase(useCase), ...nameTokens]).slice(0, 6);
}

function buildAliases(name: string, useCase: LiveProductUseCase): string[] {
  return unique([name, aliasForUseCase(useCase)]);
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
