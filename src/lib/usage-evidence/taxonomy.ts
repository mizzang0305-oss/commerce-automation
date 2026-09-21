export const SUPPORTED_USAGE_EVIDENCE_USE_CASES = {
  home_storage: {
    ruleId: "home-storage-v5", priority: 150,
    positiveTerms: ["옷장 수납", "현관 수납", "리빙박스", "홈 수납"], negativeTerms: ["차량", "세탁", "싱크대", "주방", "캠핑", "책상", "데스크"],
    categoryAllowlist: ["홈인테리어", "가구/홈"], categoryBlocklist: ["식품", "건강기능", "자동차"],
    keywords: ["옷장 수납 정리", "현관 수납 정리", "리빙박스 수납 정리"]
  },
  kitchen_organization: {
    ruleId: "kitchen-organization-v5", priority: 145,
    positiveTerms: ["싱크대 정리", "주방 수납", "냉장고 정리", "팬트리 정리", "주방 정리"], negativeTerms: ["차량", "세탁", "캠핑"],
    categoryAllowlist: ["주방"], categoryBlocklist: ["식품", "건강기능", "자동차"],
    keywords: ["싱크대 정리함", "주방 수납 선반", "냉장고 정리 용기"]
  },
  camping_storage: {
    ruleId: "camping-storage-v5", priority: 140,
    positiveTerms: ["캠핑 수납", "캠핑 정리", "아웃도어 수납", "차박 수납"], negativeTerms: ["세탁", "싱크대", "주방"],
    categoryAllowlist: ["스포츠/레저", "캠핑"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["캠핑 수납 가방", "캠핑용품 정리함", "아웃도어 수납 박스"]
  },
  vehicle_console_organization: {
    ruleId: "vehicle-console-v2", priority: 120,
    positiveTerms: ["컵홀더", "콘솔", "차량 틈새"], negativeTerms: ["세탁", "책상"],
    categoryAllowlist: ["자동차", "차량"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["차량 컵홀더 정리", "차량 콘솔 정리함", "차량 틈새 수납"]
  },
  vehicle_cabin_storage: {
    ruleId: "vehicle-cabin-v2", priority: 115,
    positiveTerms: ["시트백", "좌석 수납", "차량 뒷좌석", "트렁크 정리"], negativeTerms: ["세탁", "책상"],
    categoryAllowlist: ["자동차", "차량"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["차량 시트백 수납", "차량 뒷좌석 정리", "자동차 트렁크 정리함"]
  },
  cable_organization: {
    ruleId: "cable-v2", priority: 110,
    positiveTerms: ["케이블", "전선", "선정리", "충전선", "코드 정리"], negativeTerms: ["차량", "세탁"],
    categoryAllowlist: ["생활", "문구", "가전", "디지털", "컴퓨터"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["케이블 정리 클립", "충전선 정리함", "전선 정리 홀더"]
  },
  laundry_space_organization: {
    ruleId: "laundry-space-v2", priority: 105,
    positiveTerms: ["공간절약", "접이식 빨래", "접이식 건조", "벽부착 건조", "베란다 건조"], negativeTerms: ["차량", "책상"],
    categoryAllowlist: ["생활", "홈", "가구", "스포츠", "캠핑"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["공간절약 빨래건조대", "접이식 빨래건조대", "베란다 빨래 건조대"]
  },
  vehicle_organization: {
    ruleId: "vehicle-generic-v1", priority: 60,
    positiveTerms: ["차량", "자동차", "차박"], negativeTerms: ["세탁", "책상"],
    categoryAllowlist: ["자동차", "차량"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["차량용 정리함", "차량 수납함", "차박 수납 정리"]
  },
  desk_organization: {
    ruleId: "desk-generic-v1", priority: 55,
    positiveTerms: ["책상", "데스크", "사무실 정리"], negativeTerms: ["차량", "세탁"],
    categoryAllowlist: ["생활", "문구", "가전", "디지털", "컴퓨터", "가구"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["책상 수납 정리", "데스크 정리함", "사무실 책상 정리"]
  },
  laundry_drying: {
    ruleId: "laundry-generic-v1", priority: 50,
    positiveTerms: ["빨래", "건조대", "세탁", "행거"], negativeTerms: ["차량", "책상"],
    categoryAllowlist: ["생활", "홈", "가구", "스포츠", "캠핑"], categoryBlocklist: ["식품", "건강기능"],
    keywords: ["실내 빨래 건조대", "캠핑 빨래건조대", "세탁실 행거"]
  }
} as const;

export type SupportedUsageEvidenceUseCase = keyof typeof SUPPORTED_USAGE_EVIDENCE_USE_CASES;
export type UsageEvidenceUseCase = SupportedUsageEvidenceUseCase | "unsupported";

export const GENERIC_USAGE_EVIDENCE_USE_CASES = Object.freeze([
  "vehicle_console_organization",
  "vehicle_cabin_storage",
  "cable_organization",
  "laundry_space_organization",
  "vehicle_organization",
  "desk_organization",
  "laundry_drying"
] as const);

export const PRODUCT_BOUND_SYNTHETIC_USE_CASES = Object.freeze([
  "home_storage",
  "kitchen_organization",
  "camping_storage"
] as const);

export function definitionForUseCase(useCase: UsageEvidenceUseCase) {
  return useCase === "unsupported" ? null : SUPPORTED_USAGE_EVIDENCE_USE_CASES[useCase];
}

export function anchorsForUseCase(useCase: UsageEvidenceUseCase): string[] {
  const definition = definitionForUseCase(useCase);
  if (!definition) return ["상품", "사용", "공간", "확인"];
  if (useCase.startsWith("vehicle")) return ["차량", "정리", "수납", "공간", ...definition.positiveTerms];
  if (useCase === "cable_organization" || useCase === "desk_organization") return ["정리", "책상", "공간", "고정", ...definition.positiveTerms];
  if (useCase === "home_storage") return ["수납", "정리", "공간", "옷장", "현관", ...definition.positiveTerms];
  if (useCase === "kitchen_organization") return ["주방", "수납", "정리", "선반", "싱크대", ...definition.positiveTerms];
  if (useCase === "camping_storage") return ["캠핑", "수납", "정리", "휴대", "보관", ...definition.positiveTerms];
  return ["빨래", "건조", "공간", "접이식", ...definition.positiveTerms];
}

export function aliasForUseCase(useCase: UsageEvidenceUseCase): string {
  const aliases: Record<SupportedUsageEvidenceUseCase, string> = {
    home_storage: "홈 수납 정리용품",
    kitchen_organization: "주방 수납 정리용품",
    camping_storage: "캠핑 수납 정리용품",
    vehicle_console_organization: "차량 콘솔 정리용품",
    vehicle_cabin_storage: "차량 실내 수납용품",
    cable_organization: "케이블 정리용품",
    laundry_space_organization: "공간절약 빨래 건조용품",
    vehicle_organization: "차량용 정리용품",
    desk_organization: "책상 정리용품",
    laundry_drying: "빨래 건조용품"
  };
  return useCase === "unsupported" ? "생활용품" : aliases[useCase];
}
