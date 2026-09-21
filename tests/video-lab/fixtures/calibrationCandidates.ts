import type { CreativeCandidate } from "@/lib/video-lab/types";

export type HumanCreativeLabel = "GOOD" | "BORDERLINE" | "BAD" | "BLOCK";

export type CalibrationCandidate = {
  candidate: CreativeCandidate;
  humanLabel: HumanCreativeLabel;
  pairGroup: string;
  category: string;
};

const DISCLOSURE = "이 포스팅은 쿠팡 파트너스 활동의 일환으로 수수료를 제공받습니다.";
const GROUPS = [
  ["laundry", "접이식 빨래건조대", "빨래건조대", "건조", "비 오는 날 빨래 냄새"],
  ["cleaning", "무선 미니 청소기 특가 패키지", "미니 청소기", "청소", "차 안 부스러기"],
  ["storage", "회전식 양념 정리대 2단", "양념 정리대", "양념", "양념통 찾는 시간"],
  ["cooking", "전자레인지 전용 찜기", "전자레인지 찜기", "찜", "바쁜 아침 조리"],
  ["shoes", "휴대용 신발 건조 탈취기", "신발 건조기", "신발", "젖은 신발 관리"],
  ["bath", "욕실 유리 스퀴지", "욕실 스퀴지", "물기", "샤워 뒤 물기"],
  ["closet", "대형 압축 수납 파우치", "압축 파우치", "수납", "옷장 공간 부족"],
  ["desk", "접착식 책상 아래 서랍", "접착식 서랍", "수납", "책상 위 작은 물건"],
  ["kitchen", "자동 센서 휴지통 20L", "센서 휴지통", "센서", "조리 중 쓰레기"],
  ["window", "창문 틈새 외풍 막이", "외풍 막이", "외풍", "난방해도 추운 방"]
] as const;

function baseCandidate(
  group: (typeof GROUPS)[number],
  label: HumanCreativeLabel,
  index: number
): CreativeCandidate {
  const [pairGroup, productName, canonicalProductName, anchor, problem] = group;
  const common = {
    id: `CAL_${String(index).padStart(2, "0")}_${label}`,
    productName,
    canonicalProductName,
    productAliases: [canonicalProductName.replace(/\s/gu, "")],
    productCategory: `synthetic_${pairGroup}`,
    angle: "problem_to_benefit",
    disclosureRequired: true,
    disclosure: DISCLOSURE,
    productAnchors: [anchor]
  } satisfies Omit<CreativeCandidate, "hook" | "script">;

  if (label === "GOOD") {
    return {
      ...common,
      hook: `${problem}, 왜 계속 반복될까요?`,
      script: `${canonicalProductName}로 ${problem} 문제를 간편하게 줄여 보세요. ${anchor} 과정을 빠르게 정리하고 필요한 공간과 시간을 절약할 수 있습니다. 사용 전 크기와 설치 위치를 확인하세요.`,
      cta: "필요한 조건과 가격을 비교해 보세요."
    };
  }
  if (label === "BORDERLINE") {
    return {
      ...common,
      hook: `${canonicalProductName}, 어떤 차이가 있을까요?`,
      script: `${canonicalProductName}는 ${anchor} 과정의 불편을 줄이는 데 도움을 줍니다. 사용 공간과 규격을 먼저 확인하세요.`,
      cta: "상품 정보를 확인하세요."
    };
  }
  if (label === "BAD") {
    return {
      ...common,
      hook: `${canonicalProductName} 상품 안내`,
      script: `${canonicalProductName}는 ${anchor} 제품입니다. 제품 제품 제품 정보를 확인하세요.`,
      cta: "확인하세요."
    };
  }

  const variant = index % 5;
  if (variant === 0) {
    return {
      ...common,
      hook: `${canonicalProductName} 하나면 100% 무조건 해결!`,
      script: `${canonicalProductName}로 ${anchor} 문제를 완벽하게 해결합니다.`
    };
  }
  if (variant === 1) {
    return {
      ...common,
      hook: `제가 매일 써 본 ${canonicalProductName} 결과입니다!`,
      script: `${canonicalProductName}로 ${anchor} 문제를 줄였습니다.`,
      claimsPersonalExperience: true,
      personalExperienceEvidence: false
    };
  }
  if (variant === 2) {
    return {
      ...common,
      hook: `${canonicalProductName} 정보를 확인하세요`,
      script: `${canonicalProductName}와 관계없는 여행 일정과 날씨 이야기만 이어집니다.`,
      productAnchors: [anchor]
    };
  }
  if (variant === 3) {
    return {
      ...common,
      hook: `${canonicalProductName} ${"아주 긴 후킹 문구 ".repeat(8)}`,
      script: `${canonicalProductName}로 ${anchor} 불편을 줄입니다.`
    };
  }
  return {
    ...common,
    canonicalProductName: undefined,
    productAliases: [],
    hook: `${productName} 결과를 확인하세요`,
    script: `${productName}로 ${anchor} 불편을 줄입니다.`
  };
}

const CATEGORY_BY_LABEL: Record<HumanCreativeLabel, string> = {
  GOOD: "strong_problem_benefit_curiosity_purchase",
  BORDERLINE: "medium_benefit",
  BAD: "weak_repetitive_boring_intro",
  BLOCK: "overclaim_fake_experience_unrelated_identity_ambiguous"
};

export const calibrationCandidates: CalibrationCandidate[] = GROUPS.flatMap((group, groupIndex) =>
  (["GOOD", "BORDERLINE", "BAD", "BLOCK"] as const).map((humanLabel, labelIndex) => ({
    candidate: baseCandidate(group, humanLabel, groupIndex * 4 + labelIndex + 1),
    humanLabel,
    pairGroup: group[0],
    category: CATEGORY_BY_LABEL[humanLabel]
  }))
);
