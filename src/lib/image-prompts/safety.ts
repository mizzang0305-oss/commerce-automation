import type { ProductCandidate } from "@/types/automation";

const highRiskCategoryTerms = [
  "건강식품",
  "화장품",
  "식품",
  "의류",
  "신발",
  "고가전자제품",
  "대형가구",
  "설치형 제품",
  "유리",
  "도자기",
  "배터리",
  "전기"
];

export const commerceImageGlobalSafetyNotes = [
  "실제 써봤다고 허위 주장하지 않습니다.",
  "치료, 효능, 보장 표현을 사용하지 않습니다.",
  "무조건, 완벽, 최고 같은 단정 표현을 피합니다.",
  "가짜 브랜드 로고나 허위 고객 리뷰를 만들지 않습니다.",
  "상품 외형과 기능을 과도하게 바꾸지 않습니다.",
  "과장된 할인, 가격, 수치 문구를 넣지 않습니다."
];

function candidateCategoryText(candidate: ProductCandidate) {
  const payloadCategory = typeof candidate.payload.category_path === "string" ? candidate.payload.category_path : "";
  return [candidate.category, payloadCategory].filter(Boolean).join(" / ");
}
export function getCommerceImageRiskFlags(candidate: ProductCandidate) {
  const categoryText = candidateCategoryText(candidate);
  return highRiskCategoryTerms
    .filter((term) => categoryText.includes(term))
    .map((term) => `high_risk_category:${term}`);
}

export function getCommerceImageSafetyNotes(candidate: ProductCandidate, options?: { conservative?: boolean }) {
  const notes = [...commerceImageGlobalSafetyNotes];
  const riskFlags = getCommerceImageRiskFlags(candidate);

  if (riskFlags.length > 0) {
    notes.push("고위험 카테고리는 효능, 안전성, 착용감, 내구성, 설치 효과를 단정하지 않습니다.");
  }

  if (options?.conservative) {
    notes.push("후킹/비교 이미지는 문제 제기와 시각적 대비만 사용하고 결과를 보장하지 않습니다.");
  }

  return notes;
}

export function buildCommerceImageNegativePrompt(candidate: ProductCandidate, options?: { conservative?: boolean }) {
  const riskFlags = getCommerceImageRiskFlags(candidate);
  const conservativeAdditions = options?.conservative
    ? ", no fake before-after proof, no guaranteed results, no medical or cosmetic efficacy claim"
    : "";
  const riskAdditions = riskFlags.length > 0
    ? ", no treatment claim, no safety guarantee, no review impersonation"
    : "";

  return [
    "no fake logo",
    "no unrelated objects",
    "no exaggerated claim",
    "no fake customer review",
    "no distorted product shape",
    "no misleading price or discount text"
  ].join(", ") + riskAdditions + conservativeAdditions;
}
