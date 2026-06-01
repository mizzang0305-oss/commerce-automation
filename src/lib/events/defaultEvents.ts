import type { EventCalendarItem, EventType } from "@/types/automation";

type DefaultEventSeed = {
  event_key: string;
  event_name: string;
  event_type: EventType;
  month: number;
  day: number;
  duration_days?: number;
  target_categories: string[];
  target_keywords: string[];
  excluded_keywords?: string[];
  platforms?: string[];
  priority: number;
  seasonality_score: number;
};

const DEFAULT_EVENT_SEEDS: DefaultEventSeed[] = [
  {
    event_key: "lunar-new-year",
    event_name: "설날",
    event_type: "holiday",
    month: 2,
    day: 17,
    duration_days: 5,
    target_categories: ["선물", "식품", "생활"],
    target_keywords: ["설날", "명절", "선물", "귀성"],
    excluded_keywords: ["효능", "치료"],
    priority: 95,
    seasonality_score: 30
  },
  {
    event_key: "valentines-day",
    event_name: "발렌타인데이",
    event_type: "holiday",
    month: 2,
    day: 14,
    target_categories: ["선물", "식품", "패션"],
    target_keywords: ["발렌타인", "초콜릿", "선물"],
    priority: 75,
    seasonality_score: 22
  },
  {
    event_key: "white-day",
    event_name: "화이트데이",
    event_type: "holiday",
    month: 3,
    day: 14,
    target_categories: ["선물", "식품", "뷰티"],
    target_keywords: ["화이트데이", "사탕", "선물"],
    priority: 72,
    seasonality_score: 20
  },
  {
    event_key: "new-semester",
    event_name: "신학기",
    event_type: "school",
    month: 3,
    day: 2,
    duration_days: 14,
    target_categories: ["문구", "키즈", "생활"],
    target_keywords: ["신학기", "입학", "준비물", "책상"],
    priority: 82,
    seasonality_score: 25
  },
  {
    event_key: "children-day",
    event_name: "어린이날",
    event_type: "family",
    month: 5,
    day: 5,
    target_categories: ["키즈", "완구", "선물"],
    target_keywords: ["어린이날", "키즈", "장난감", "선물"],
    priority: 90,
    seasonality_score: 28
  },
  {
    event_key: "parents-day",
    event_name: "어버이날",
    event_type: "family",
    month: 5,
    day: 8,
    target_categories: ["선물", "생활", "건강"],
    target_keywords: ["어버이날", "부모님", "선물"],
    excluded_keywords: ["치료", "완치", "효능"],
    priority: 86,
    seasonality_score: 25
  },
  {
    event_key: "teachers-day",
    event_name: "스승의날",
    event_type: "family",
    month: 5,
    day: 15,
    target_categories: ["선물", "문구", "식품"],
    target_keywords: ["스승의날", "선생님", "선물"],
    priority: 70,
    seasonality_score: 18
  },
  {
    event_key: "summer-vacation",
    event_name: "여름휴가",
    event_type: "season",
    month: 7,
    day: 20,
    duration_days: 30,
    target_categories: ["여행", "캠핑", "생활"],
    target_keywords: ["여름휴가", "여행", "쿨러", "물놀이"],
    priority: 86,
    seasonality_score: 24
  },
  {
    event_key: "rainy-season",
    event_name: "장마철",
    event_type: "weather",
    month: 6,
    day: 25,
    duration_days: 21,
    target_categories: ["생활", "자동차", "패션"],
    target_keywords: ["장마", "우산", "제습", "방수"],
    priority: 78,
    seasonality_score: 20
  },
  {
    event_key: "chuseok",
    event_name: "추석",
    event_type: "holiday",
    month: 9,
    day: 25,
    duration_days: 5,
    target_categories: ["선물", "식품", "생활"],
    target_keywords: ["추석", "명절", "선물", "귀성"],
    excluded_keywords: ["치료", "효능"],
    priority: 96,
    seasonality_score: 30
  },
  {
    event_key: "kimjang-season",
    event_name: "김장철",
    event_type: "food",
    month: 11,
    day: 15,
    duration_days: 21,
    target_categories: ["주방", "식품", "생활"],
    target_keywords: ["김장", "김치", "주방", "보관"],
    priority: 74,
    seasonality_score: 19
  },
  {
    event_key: "black-friday",
    event_name: "블랙프라이데이",
    event_type: "sale",
    month: 11,
    day: 27,
    duration_days: 5,
    target_categories: ["전자", "패션", "생활"],
    target_keywords: ["블랙프라이데이", "할인", "특가"],
    priority: 90,
    seasonality_score: 26
  },
  {
    event_key: "christmas",
    event_name: "크리스마스",
    event_type: "holiday",
    month: 12,
    day: 25,
    target_categories: ["선물", "키즈", "식품", "인테리어"],
    target_keywords: ["크리스마스", "선물", "파티", "장식"],
    priority: 94,
    seasonality_score: 30
  },
  {
    event_key: "year-end-gift",
    event_name: "연말선물",
    event_type: "season",
    month: 12,
    day: 20,
    duration_days: 12,
    target_categories: ["선물", "생활", "식품"],
    target_keywords: ["연말", "선물", "추천"],
    priority: 92,
    seasonality_score: 28
  },
  {
    event_key: "winter-warm",
    event_name: "겨울방한",
    event_type: "weather",
    month: 12,
    day: 1,
    duration_days: 60,
    target_categories: ["패션", "생활", "난방"],
    target_keywords: ["겨울", "방한", "보온", "난방"],
    priority: 82,
    seasonality_score: 24
  },
  {
    event_key: "camping-season",
    event_name: "캠핑시즌",
    event_type: "season",
    month: 9,
    day: 1,
    duration_days: 45,
    target_categories: ["캠핑", "여행", "생활"],
    target_keywords: ["캠핑", "차박", "야외"],
    priority: 76,
    seasonality_score: 20
  }
];

function toIsoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0)).toISOString();
}

export function getDefaultEventCalendar(year = new Date().getFullYear()): EventCalendarItem[] {
  const createdAt = toIsoDate(year, 1, 1);
  return DEFAULT_EVENT_SEEDS.map((seed) => {
    const startsAt = new Date(Date.UTC(year, seed.month - 1, seed.day, 0, 0, 0, 0));
    const endsAt = new Date(startsAt.getTime() + ((seed.duration_days ?? 1) - 1) * 86_400_000);
    return {
      id: `event-${year}-${seed.event_key}`,
      event_key: seed.event_key,
      event_name: seed.event_name,
      event_type: seed.event_type,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      lead_days_min: 7,
      lead_days_max: 30,
      target_categories: seed.target_categories,
      target_keywords: seed.target_keywords,
      excluded_keywords: seed.excluded_keywords ?? [],
      platforms: seed.platforms ?? ["coupang", "test"],
      priority: seed.priority,
      seasonality_score: seed.seasonality_score,
      status: "active",
      created_at: createdAt,
      updated_at: createdAt
    };
  });
}
