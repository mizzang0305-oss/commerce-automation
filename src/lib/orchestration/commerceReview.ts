import {
  collectorSourcePolicySchema,
  type CollectedProduct,
  type CollectorSourcePolicy,
  type CommerceReviewIssue,
  type ReviewedProduct
} from "@/lib/orchestration/commercePocSchemas";

const DEFAULT_FORBIDDEN_WORDS = ["도박", "불법", "성인용"];
const DEFAULT_EXAGGERATION_TERMS = ["100%", "무조건", "절대", "완벽", "기적", "최고"];

export function reviewCollectedProducts(
  products: CollectedProduct[],
  rawPolicy: CollectorSourcePolicy,
  reviewedAt = new Date().toISOString(),
  knownProducts: CollectedProduct[] = []
): ReviewedProduct[] {
  const policy = collectorSourcePolicySchema.parse(rawPolicy);
  const allowedHosts = new Set(policy.allowed_hosts.map((host) => host.toLowerCase()));
  const forbiddenWords = uniqueNormalized([...DEFAULT_FORBIDDEN_WORDS, ...policy.forbidden_words]);
  const exaggerationTerms = uniqueNormalized([...DEFAULT_EXAGGERATION_TERMS, ...policy.exaggeration_terms]);
  const seenHashes = new Set(knownProducts.map((product) => product.raw_hash));
  const seenProductKeys = new Set(
    knownProducts.map((product) => normalizeKey(`${product.seller}:${product.product_name}`))
  );

  return products.map((product) => {
    const issues: CommerceReviewIssue[] = [];
    if (!product.product_name.trim()) {
      issues.push(issue("PRODUCT_NAME_MISSING", "product_name", "상품명이 누락되었습니다."));
    }
    if (product.price === null) {
      issues.push(issue("PRICE_MISSING", "price", "가격이 누락되었습니다."));
    }
    if (!product.image_url.trim()) {
      issues.push(issue("IMAGE_MISSING", "image_url", "이미지 URL이 누락되었습니다."));
    } else if (!isSafeHttpUrl(product.image_url)) {
      issues.push(issue("IMAGE_URL_INVALID", "image_url", "이미지 URL은 http/https여야 합니다."));
    }

    const source = parseHttpUrl(product.source_url);
    if (!source) {
      issues.push(issue("SOURCE_URL_INVALID", "source_url", "원본 링크가 올바른 http/https URL이 아닙니다."));
    } else if (!allowedHosts.has(source.hostname.toLowerCase())) {
      issues.push(issue("SOURCE_NOT_ALLOWED", "source_url", "원본 링크의 호스트가 수집 허용 목록에 없습니다."));
    }

    const searchText = `${product.product_name} ${product.seller}`.toLocaleLowerCase("ko-KR");
    const forbidden = forbiddenWords.find((word) => searchText.includes(word));
    if (forbidden) {
      issues.push(issue("FORBIDDEN_WORD", "product_name", `금지어가 포함되었습니다: ${forbidden}`));
    }
    const exaggerated = exaggerationTerms.find((term) => searchText.includes(term));
    if (exaggerated) {
      issues.push(issue("EXAGGERATED_CLAIM", "product_name", `과장 표현이 포함되었습니다: ${exaggerated}`));
    }

    const productKey = normalizeKey(`${product.seller}:${product.product_name}`);
    if (seenHashes.has(product.raw_hash) || seenProductKeys.has(productKey)) {
      issues.push(issue("DUPLICATE_PRODUCT", "raw_hash", "같은 수집 배치에 중복 상품이 있습니다."));
    }
    seenHashes.add(product.raw_hash);
    seenProductKeys.add(productKey);

    return {
      product,
      status: issues.length === 0 ? "pass" : "blocked",
      issues,
      reviewed_at: reviewedAt
    };
  });
}

function issue(code: CommerceReviewIssue["code"], field: string, message: string): CommerceReviewIssue {
  return { code, field, message };
}

function parseHttpUrl(value: string) {
  try {
    const url = new URL(value);
    const isHttp = url.protocol === "http:" || url.protocol === "https:";
    const hasEmbeddedCredentials = Boolean(url.username || url.password);
    return isHttp && !hasEmbeddedCredentials ? url : null;
  } catch {
    return null;
  }
}

function isSafeHttpUrl(value: string) {
  return Boolean(parseHttpUrl(value));
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
}

function uniqueNormalized(values: string[]) {
  return [...new Set(values.map((value) => value.trim().toLocaleLowerCase("ko-KR")).filter(Boolean))];
}
