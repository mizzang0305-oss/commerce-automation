import { collectedProductSchema, type CollectedProduct } from "./commercePocSchemas";

export const COMMERCE_PREVIEW_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const COMMERCE_PREVIEW_MAX_ROWS = 200;

export type CommercePreviewErrorCode =
  | "EMPTY_FILE"
  | "INVALID_JSON"
  | "INVALID_PRODUCT"
  | "UNSAFE_IMAGE_URL"
  | "UNSAFE_SOURCE_URL"
  | "ROW_LIMIT_EXCEEDED";

export type CommercePreviewError = {
  line: number | null;
  code: CommercePreviewErrorCode;
  message: string;
};

export type CommerceProductPreviewResult = {
  products: CollectedProduct[];
  errors: CommercePreviewError[];
  total_rows: number;
};

export function parseCommerceProductPreview(content: string): CommerceProductPreviewResult {
  const lines = content
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => line.trim().length > 0);

  if (lines.length === 0) {
    return {
      products: [],
      errors: [{ line: null, code: "EMPTY_FILE", message: "비어 있지 않은 JSONL 파일이 필요합니다." }],
      total_rows: 0
    };
  }

  if (lines.length > COMMERCE_PREVIEW_MAX_ROWS) {
    return {
      products: [],
      errors: [{
        line: null,
        code: "ROW_LIMIT_EXCEEDED",
        message: `한 번에 최대 ${COMMERCE_PREVIEW_MAX_ROWS}개 상품만 미리볼 수 있습니다.`
      }],
      total_rows: lines.length
    };
  }

  const products: CollectedProduct[] = [];
  const errors: CommercePreviewError[] = [];

  for (const { line, lineNumber } of lines) {
    let raw: unknown;
    try {
      raw = JSON.parse(line) as unknown;
    } catch {
      errors.push({ line: lineNumber, code: "INVALID_JSON", message: "올바른 JSON 객체가 아닙니다." });
      continue;
    }

    const parsed = collectedProductSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push({
        line: lineNumber,
        code: "INVALID_PRODUCT",
        message: "필수 상품 필드 또는 데이터 형식이 올바르지 않습니다."
      });
      continue;
    }

    if (!isSafeHttpsUrl(parsed.data.image_url)) {
      errors.push({ line: lineNumber, code: "UNSAFE_IMAGE_URL", message: "image_url은 HTTPS URL이어야 합니다." });
      continue;
    }
    if (!isSafeHttpsUrl(parsed.data.source_url)) {
      errors.push({ line: lineNumber, code: "UNSAFE_SOURCE_URL", message: "source_url은 HTTPS URL이어야 합니다." });
      continue;
    }

    products.push(parsed.data);
  }

  return { products, errors, total_rows: lines.length };
}

function isSafeHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
