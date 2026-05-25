import { createHash } from "node:crypto";
import type { ProductCandidate } from "@/types/automation";

export type CandidateImportOptions = {
  source: string;
};

export type CandidateImportResult = {
  candidates: ProductCandidate[];
  errors: string[];
};

type CandidateRow = Record<string, string>;

const NAME_HEADERS = ["product_name", "name", "title", "상품명"];
const URL_HEADERS = ["url", "product_url", "raw_coupang_url", "source_url", "링크"];
const AFFILIATE_HEADERS = ["selected_affiliate_url", "affiliate_url", "제휴링크"];

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

    const normalizedSourceUrl = stripTrailingSlash(sourceUrl);
    const id = createCandidateId(normalizedSourceUrl);
    if (candidates.has(id)) {
      return;
    }

    candidates.set(id, {
      id,
      product_name: productName,
      raw_coupang_url: normalizedSourceUrl,
      selected_affiliate_url: affiliateUrl ? stripTrailingSlash(affiliateUrl) : "",
      payload: {
        source: options.source,
        source_url: normalizedSourceUrl,
        category_path: pick(row, ["category_path", "category", "카테고리"]),
        keyword: pick(row, ["keyword", "키워드"]),
        price_now_text: pick(row, ["price_now_text", "price", "가격"])
      },
      created_at: now,
      updated_at: now
    });
  });

  return { candidates: [...candidates.values()], errors };
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
    if (char === '"' && quoted && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
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
