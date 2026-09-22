import { collectedProductSchema, type CollectedProduct } from "./commercePocSchemas";
import {
  buildRollingEventWindow,
  listCommerceEventsForWindow,
  type CommerceEvent,
  type EventWindow
} from "@/lib/coupang/eventCalendar";

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

export type CommerceAutoEventPreview = {
  event_id: string;
  name: string;
  type: CommerceEvent["type"];
  start_date: string;
  end_date: string;
  active_now: boolean;
  days_until_start: number;
  confidence: CommerceEvent["confidence"];
  source: CommerceEvent["source"];
  product_terms: string[];
};

export type CommerceAutoProductSelection = {
  product: CollectedProduct;
  event_id: string;
  event_name: string;
  relevance_score: number;
  matched_terms: string[];
};

export type CommerceAutoPreviewPlan = {
  mode: "korea_30d_event_product_auto_selection";
  generated_at: string;
  event_window: EventWindow;
  events: CommerceAutoEventPreview[];
  selected_event: CommerceAutoEventPreview | null;
  product_search_terms: string[];
  products_considered: number;
  selected_product: CommerceAutoProductSelection | null;
  current_blocker: "LOCAL_PRODUCT_POOL_EMPTY" | "NO_EVENT_MATCHED_PRODUCT" | null;
  owner_review_required: true;
  publish_allowed: false;
  external_upload: false;
  database_write: false;
  queue_write: false;
  worker_job_created: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
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

export function buildCommerceAutoPreviewPlan(input: {
  today?: string | Date;
  products?: CollectedProduct[];
  dynamicEvents?: CommerceEvent[];
  generatedAt?: string;
} = {}): CommerceAutoPreviewPlan {
  const eventWindow = buildRollingEventWindow({ today: input.today });
  const products = uniqueProducts(input.products ?? []);
  const events = listCommerceEventsForWindow(eventWindow, { dynamicEvents: input.dynamicEvents })
    .map((event) => toEventPreview(event, eventWindow.startDate));
  const rankedMatches = events.flatMap((event) =>
    products
      .map((product) => scoreProductForEvent(product, event))
      .filter((selection): selection is CommerceAutoProductSelection => selection !== null)
  ).sort((left, right) =>
    right.relevance_score - left.relevance_score ||
    left.event_name.localeCompare(right.event_name, "ko-KR") ||
    left.product.product_name.localeCompare(right.product.product_name, "ko-KR")
  );
  const selectedProduct = rankedMatches[0] ?? null;
  const selectedEvent = selectedProduct
    ? events.find((event) => event.event_id === selectedProduct.event_id) ?? null
    : events[0] ?? null;

  return {
    mode: "korea_30d_event_product_auto_selection",
    generated_at: input.generatedAt ?? new Date().toISOString(),
    event_window: eventWindow,
    events,
    selected_event: selectedEvent,
    product_search_terms: selectedEvent?.product_terms ?? [],
    products_considered: products.length,
    selected_product: selectedProduct,
    current_blocker: products.length === 0
      ? "LOCAL_PRODUCT_POOL_EMPTY"
      : selectedProduct
        ? null
        : "NO_EVENT_MATCHED_PRODUCT",
    owner_review_required: true,
    publish_allowed: false,
    external_upload: false,
    database_write: false,
    queue_write: false,
    worker_job_created: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function toEventPreview(event: CommerceEvent, today: string): CommerceAutoEventPreview {
  const start = event.dateRange?.start ?? event.date ?? today;
  const end = event.dateRange?.end ?? event.date ?? start;
  return {
    event_id: event.eventId,
    name: event.name,
    type: event.type,
    start_date: start,
    end_date: end,
    active_now: start <= today && today <= end,
    days_until_start: Math.max(0, daysBetween(today, start)),
    confidence: event.confidence,
    source: event.source,
    product_terms: productTermsForEvent(event)
  };
}

function productTermsForEvent(event: CommerceEvent) {
  const presets: Record<string, string[]> = {
    seollal: ["설 선물", "한과", "떡국", "명절 음식", "선물세트"],
    valentine: ["선물 포장", "초콜릿", "카드", "디저트 용기"],
    "winter-break-end": ["문구", "책상 정리", "가방", "아이 간식"],
    "spring-school": ["문구", "책상 정리", "가방", "학용품"],
    "white-day": ["선물 포장", "사탕", "카드", "디저트 용기"],
    "spring-moving": ["수납", "정리함", "청소", "이사"],
    "children-day": ["보드게임", "문구", "완구", "미술놀이"],
    "parents-day": ["카네이션", "감사 선물", "텀블러", "선물 포장"],
    "teachers-day": ["감사 카드", "문구 선물", "텀블러", "선물 포장"],
    "buddhas-birthday": ["연등", "행사 용품", "나들이", "간편식"],
    "summer-prep": ["선풍기", "냉감패드", "보냉백", "여름 침구"],
    "rainy-season": ["제습기", "습기제거제", "빨래건조대", "우산", "방수"],
    "summer-vacation": ["물놀이", "보냉백", "아이스박스", "방수팩", "여행용품"],
    "summer-break-start": ["아이 간식", "냉동식품", "물놀이", "보드게임"],
    "summer-break-end": ["문구", "책상 정리", "가방", "아이 간식"],
    "fall-school": ["문구", "책상 정리", "가방", "학용품"],
    chobok: ["삼계탕", "보양식", "냉면", "선풍기", "냉감패드"],
    jungbok: ["삼계탕", "보양식", "냉면", "선풍기", "냉감패드"],
    malbok: ["삼계탕", "보양식", "냉면", "선풍기", "냉감패드"],
    "camping-season": ["캠핑", "보냉백", "아이스박스", "돗자리", "바비큐"],
    "fall-camping": ["캠핑", "보냉백", "아이스박스", "돗자리", "바비큐"],
    "chuseok-prep": ["추석 선물", "선물세트", "명절 음식", "한과", "포장"],
    chuseok: ["추석 선물", "선물세트", "명절 음식", "한과", "포장"],
    kimjang: ["김장 매트", "김치통", "주방 장갑", "밀폐용기"],
    "pepero-day": ["선물 포장", "과자", "카드", "디저트 용기"],
    csat: ["수능 선물", "응원 간식", "보온병", "문구"],
    "winter-prep": ["전기담요", "가습기", "방한", "보온"],
    "winter-break-start": ["아이 간식", "보드게임", "겨울 놀이", "홈베이킹"],
    "christmas-year-end": ["크리스마스 장식", "선물 포장", "홈파티", "무드등"]
  };
  return presets[event.eventId] ?? fallbackTerms(event.type);
}

function fallbackTerms(type: CommerceEvent["type"]) {
  if (type === "school") {
    return ["문구", "수납", "아이 간식", "책상 정리"];
  }
  if (type === "holiday" || type === "anniversary") {
    return ["선물", "선물 포장", "간편식", "행사 용품"];
  }
  if (type === "weather") {
    return ["계절가전", "생활용품", "보관", "정리"];
  }
  return ["생활용품", "주방용품", "수납", "선물"];
}

function scoreProductForEvent(
  product: CollectedProduct,
  event: CommerceAutoEventPreview
): CommerceAutoProductSelection | null {
  const searchable = comparable(`${product.product_name} ${product.seller}`);
  const matchedTerms = event.product_terms.filter((term) => searchable.includes(comparable(term)));
  if (matchedTerms.length === 0) {
    return null;
  }
  const urgencyScore = event.active_now ? 18 : event.days_until_start <= 7 ? 15 : event.days_until_start <= 14 ? 10 : 5;
  const evidenceScore = (product.price !== null ? 5 : 0) + (product.image_url ? 5 : 0) + (product.source_url ? 5 : 0);
  const matchScore = 45 + Math.min(20, (matchedTerms.length - 1) * 10);
  return {
    product,
    event_id: event.event_id,
    event_name: event.name,
    relevance_score: Math.min(100, matchScore + urgencyScore + evidenceScore),
    matched_terms: matchedTerms
  };
}

function uniqueProducts(products: CollectedProduct[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    const key = product.raw_hash || comparable(`${product.seller}:${product.product_name}`);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function daysBetween(start: string, end: string) {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86_400_000);
}

function comparable(value: string) {
  return value.toLocaleLowerCase("ko-KR").replace(/[^a-z0-9가-힣]+/gu, "");
}

function isSafeHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
