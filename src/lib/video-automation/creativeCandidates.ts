import type { CreativeCandidate } from "../video-lab/types";
import type { ProductVideoAutomationInput } from "./types";

export function generateDeterministicCreativeCandidates(input: ProductVideoAutomationInput): CreativeCandidate[] {
  const { canonicalProductName: name, aliases, anchors, category } = input.product;
  const [anchor1, anchor2, anchor3, anchor4 = category] = anchors;
  const common = {
    productName: name,
    canonicalProductName: name,
    productAliases: aliases,
    productCategory: category,
    productAnchors: anchors,
    disclosureRequired: false,
    claimsPersonalExperience: false,
    personalExperienceEvidence: false
  } as const;
  return [
    {
      ...common,
      id: `${input.product.productKey}-problem-first`,
      angle: "problem_first",
      hook: `${anchor1} 정리, 왜 자꾸 불편할까요?`,
      script: `${name}으로 ${anchor1} 주변의 불편한 문제를 줄여 보세요. ${anchor2}와 ${anchor3}을 한곳에 정리하면 동선이 간편해집니다. 사용 전 크기와 ${anchor4} 조건을 확인하세요.`,
      cta: "내 공간에 맞는지 확인해 보세요."
    },
    {
      ...common,
      id: `${input.product.productKey}-benefit-first`,
      angle: "benefit_first",
      hook: `${anchor2} 공간을 한 번에 정리!`,
      script: `${name}은 ${anchor1}과 ${anchor2}을 깔끔하게 정리하는 방법입니다. 필요한 ${anchor3}을 빠르게 찾고 좁은 공간도 간편하게 쓸 수 있어요. 구매 전 크기와 ${anchor4} 조건을 확인하세요.`,
      cta: "정리 전후를 비교해 보세요."
    },
    {
      ...common,
      id: `${input.product.productKey}-curiosity-checklist`,
      angle: "curiosity_checklist",
      hook: `${anchor1}, 이 3가지만 확인하세요`,
      script: `${name}을 고를 때 ${anchor1}, ${anchor2}, ${anchor3} 세 가지를 확인하세요. 공간에 맞는 크기인지, 정리가 간편한지, ${anchor4} 조건에 맞는지 비교하면 선택이 쉬워집니다.`,
      cta: "세 가지 조건부터 비교해 보세요."
    }
  ];
}
