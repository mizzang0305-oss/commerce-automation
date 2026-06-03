import { createHash } from "node:crypto";
import type { ProductCandidate } from "@/types/automation";
import { enrichProductCandidate } from "@/lib/candidates/candidateNormalizer";
import { buildCoupangCandidate, CoupangCandidateImportError } from "@/lib/coupang/coupangCandidateImport";
import { isLikelyCoupangProductUrl } from "@/lib/coupang/coupangUrl";

export type CandidateImportOptions = {
  source: string;
};

export type CandidateImportResult = {
  candidates: ProductCandidate[];
  errors: string[];
};

type CandidateRow = Record<string, string>;

const NAME_HEADERS = ["product_name", "name", "title"];
const URL_HEADERS = ["url", "product_url", "raw_coupang_url", "source_url"];
const AFFILIATE_HEADERS = ["selected_affiliate_url", "affiliate_url"];

export function parseCandidateCsv(csv: string, options: CandidateImportOptions): CandidateImportResult {
  const rows = parseCsv(csv);
  const candidates = new Map<string, ProductCandidate>();
  const errors: string[] = [];
  const now = new Date().toISOString();

  rows.forEach((row, index) => {
    const lineNumber = index + 2;
    const productName = pick(row, NAME_HEADERS);
    const sourceUrl = normalizeUrl(pick(row, URL_HEADERS));
    const affiliateUrl = normalizeUrl(pick(row, AFFILIATE_HEADERS), { allowEmpty: true });

    if (!productName) {
      errors.push(`${lineNumber}행: 상품명이 비어 있습니다.`);
      return;
    }
    if (!sourceUrl) {
      errors.push(`${lineNumber}행: 상품 URL이 비어 있습니다.`);
      return;
    }
    if (!isSafeHttpUrl(sourceUrl) || (affiliateUrl && !isSafeHttpUrl(affiliateUrl))) {
      errors.push(`${lineNumber}행: http/https URL만 가져올 수 있습니다.`);
      return;
    }

    if (isCoupangImport(options.source, sourceUrl)) {
      try {
        const { candidate } = buildCoupangCandidate({
          product_name: productName,
          raw_coupang_url: sourceUrl,
          selected_affiliate_url: affiliateUrl,
          thumbnail_url: pick(row, ["thumbnail_url", "image_url", "image"]),
          price_now_text: pick(row, ["price_now_text", "price"]),
          category_path: pick(row, ["category_path", "category"]),
          source_type: pick(row, ["source_type", "type"]),
          itemId: pick(row, ["itemId", "item_id"]),
          vendorItemId: pick(row, ["vendorItemId", "vendor_item_id"]),
          source: options.source
        });
        if (!candidates.has(candidate.id)) {
          candidates.set(candidate.id, candidate);
        }
      } catch (error) {
        const message =
          error instanceof CoupangCandidateImportError ? error.message : "Coupang candidate conversion failed.";
        errors.push(`${lineNumber}행: ${message}`);
      }
      return;
    }

    const normalizedSourceUrl = stripTrailingSlash(sourceUrl);
    const id = createCandidateId(normalizedSourceUrl);
    if (candidates.has(id)) {
      return;
    }

    candidates.set(id, {
      ...enrichProductCandidate({
        id,
        product_name: productName,
        raw_coupang_url: normalizedSourceUrl,
        selected_affiliate_url: affiliateUrl ? stripTrailingSlash(affiliateUrl) : "",
        payload: {
          source: options.source,
          source_url: normalizedSourceUrl,
          category_path: pick(row, ["category_path", "category"]),
          keyword: pick(row, ["keyword"]),
          price_now_text: pick(row, ["price_now_text", "price"]),
          source_type: pick(row, ["source_type", "type"]),
          thumbnail_url: pick(row, ["thumbnail_url", "image_url", "image"]),
          discount_rate: pick(row, ["discount_rate", "discount"]),
          review_count: pick(row, ["review_count", "reviews"]),
          rating: pick(row, ["rating"]),
          productId: pick(row, ["productId", "product_id"]),
          itemId: pick(row, ["itemId", "item_id"]),
          vendorItemId: pick(row, ["vendorItemId", "vendor_item_id"]),
          goods_no: pick(row, ["goods_no", "goodsNo"])
        },
        created_at: now,
        updated_at: now
      })
    });
  });

  return { candidates: [...candidates.values()], errors };
}

function isCoupangImport(source: string, sourceUrl: string) {
  return source.toLowerCase().includes("coupang") || isLikelyCoupangProductUrl(sourceUrl);
}

function parseCsv(csv: string): CandidateRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length <= 1) {
    return [];
  }
  const headers = splitCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()]));
  });
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
      continue;
    }
    if (char === "\"") {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      values.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  values.push(current);
  return values;
}

function pick(row: CandidateRow, headers: string[]) {
  for (const header of headers) {
    const value = row[header]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeUrl(value: string, options: { allowEmpty?: boolean } = {}) {
  const trimmed = value.trim();
  if (!trimmed && options.allowEmpty) {
    return "";
  }
  return trimmed;
}

function isSafeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function createCandidateId(sourceUrl: string) {
  const digest = createHash("sha256").update(sourceUrl).digest("hex").slice(0, 16);
  return `candidate-${digest}`;
}
