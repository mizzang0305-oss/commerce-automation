import type { CommerceEvent } from "@/lib/coupang/eventCalendar";

export interface EventProductKeywordPlan {
  eventId: string;
  eventName: string;
  primaryKeywords: string[];
  secondaryKeywords: string[];
  excludedKeywords: string[];
  preferredCategories: string[];
  blockedCategories: string[];
}

const DEFAULT_EXCLUDED_KEYWORDS = [
  "성인",
  "의약",
  "약",
  "건강기능",
  "영양제",
  "다이어트",
  "주류",
  "담배",
  "전자담배",
  "무기",
  "도검",
  "도박",
  "가품",
  "명품",
  "정품보장",
  "최저가"
];

const DEFAULT_BLOCKED_CATEGORIES = [
  "성인용품",
  "의약품",
  "건강기능식품",
  "주류",
  "무기",
  "도박",
  "명품/가품"
];

const DEFAULT_PREFERRED_CATEGORIES = ["생활용품", "주방용품", "수납/정리", "문구", "홈데코"];

export function buildEventProductKeywordPlan(event: CommerceEvent): EventProductKeywordPlan {
  const preset = keywordPreset(event.eventId, event.type);
  return {
    eventId: event.eventId,
    eventName: event.name,
    primaryKeywords: unique(preset.primaryKeywords),
    secondaryKeywords: unique(preset.secondaryKeywords),
    excludedKeywords: unique([...DEFAULT_EXCLUDED_KEYWORDS, ...preset.excludedKeywords]),
    preferredCategories: unique([...DEFAULT_PREFERRED_CATEGORIES, ...preset.preferredCategories]),
    blockedCategories: unique([...DEFAULT_BLOCKED_CATEGORIES, ...preset.blockedCategories])
  };
}

export function buildEventProductKeywordPlans(events: CommerceEvent[]) {
  return events.map(buildEventProductKeywordPlan);
}

function keywordPreset(eventId: string, type: CommerceEvent["type"]) {
  switch (eventId) {
    case "rainy-season":
      return preset(
        ["제습기", "습기제거제", "빨래건조대"],
        ["방수커버", "우산꽂이", "실내건조", "장마 정리함"],
        ["생활용품", "세탁/건조", "수납/정리"],
        []
      );
    case "summer-prep":
      return preset(
        ["휴대용 선풍기", "냉감패드", "보냉백"],
        ["여름 침구", "아이스박스", "차량용 햇빛가리개"],
        ["생활용품", "계절가전", "침구"],
        []
      );
    case "summer-vacation":
    case "camping-season":
    case "fall-camping":
      return preset(
        ["캠핑의자", "보냉백", "휴대용 선풍기"],
        ["방수팩", "차량용 정리함", "아이스박스", "돗자리"],
        ["캠핑", "자동차용품", "생활용품"],
        []
      );
    case "chobok":
    case "jungbok":
    case "malbok":
      return preset(
        ["휴대용 선풍기", "냉감패드", "여름 주방용품"],
        ["보냉병", "아이스 트레이", "실내 냉방용품"],
        ["생활용품", "주방용품", "계절가전"],
        ["식품/건강"]
      );
    case "parents-day":
    case "teachers-day":
      return preset(
        ["꽃다발", "카네이션", "감사 카드"],
        ["텀블러", "문구 선물", "보온병"],
        ["선물", "문구", "생활용품"],
        ["건강기능식품", "마사지기"]
      );
    case "children-day":
      return preset(
        ["보드게임", "색연필", "문구 세트"],
        ["어린이 책상 정리", "캐릭터 수납함", "미술놀이"],
        ["문구", "완구", "수납/정리"],
        ["전자게임"]
      );
    case "valentine":
    case "white-day":
    case "pepero-day":
      return preset(
        ["선물 포장", "카드", "디저트 보관용기"],
        ["리본", "포장 박스", "무드등"],
        ["선물", "문구", "홈데코"],
        ["과장효능"]
      );
    case "kimjang":
      return preset(
        ["김장 매트", "김치통", "주방 장갑"],
        ["밀폐용기", "도마 정리대", "주방 수납"],
        ["주방용품", "보관용기", "수납/정리"],
        ["식품/건강"]
      );
    case "christmas-year-end":
      return preset(
        ["선물 포장", "크리스마스 장식", "무드등"],
        ["테이블 장식", "카드", "홈파티 용품"],
        ["선물", "홈데코", "문구"],
        []
      );
    default:
      return type === "school"
        ? preset(
            ["문구 세트", "책상 정리함", "가방 정리"],
            ["색연필", "파일 보관함", "학용품 정리"],
            ["문구", "수납/정리", "생활용품"],
            []
          )
        : preset(
            ["생활 정리", "주방 정리", "선물 포장"],
            ["수납함", "텀블러", "홈데코"],
            DEFAULT_PREFERRED_CATEGORIES,
            []
          );
  }
}

function preset(
  primaryKeywords: string[],
  secondaryKeywords: string[],
  preferredCategories: string[],
  blockedCategories: string[],
  excludedKeywords: string[] = []
) {
  return {
    primaryKeywords,
    secondaryKeywords,
    preferredCategories,
    blockedCategories,
    excludedKeywords
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
