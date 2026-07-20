import {
  commerceContentDraftSchema,
  type CommerceContentDraft,
  type ReviewedProduct
} from "@/lib/orchestration/commercePocSchemas";

export function buildCommerceContentDrafts(
  reviews: ReviewedProduct[],
  createdAt = new Date().toISOString()
): CommerceContentDraft[] {
  return reviews
    .filter((review) => review.status === "pass")
    .map(({ product }) => commerceContentDraftSchema.parse({
      schema_version: "1",
      id: `commerce-draft-${product.raw_hash.slice(0, 16)}`,
      product_raw_hash: product.raw_hash,
      state: "draft",
      title: `${product.product_name} 가격·재고 확인 초안`,
      short_caption: `${product.product_name}의 현재 가격과 재고를 원본 링크에서 확인하세요.`,
      description: `${product.seller}에서 수집된 상품 정보 기반 초안입니다. 게시 전 가격, 재고, 이미지와 원본 링크를 다시 검수해야 합니다.`,
      image_url: product.image_url,
      source_url: product.source_url,
      channels: ["youtube_shorts", "tiktok", "threads", "shopping_mall"],
      approval_required: true,
      publish_allowed: false,
      created_at: createdAt
    }));
}
