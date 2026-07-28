import { createHash } from "node:crypto";
import { buildCoupangPartnersSearchRequest } from "@/lib/coupang/partnersAuthConfig";
import { buildRollingEventWindow, listCommerceEventsForWindow } from "@/lib/coupang/eventCalendar";
import {
  buildCommerceDailyScheduleId,
  getCommerceDailySlot,
  type CommerceDailySlotId
} from "@/lib/orchestration/commerceDailyCadence";

export const COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL =
  "APPROVE_COUPANG_SCHEDULED_PRODUCT_SEARCH";

export type AuthoritativeScheduledProduct = {
  product_name: string;
  raw_coupang_url: string;
  selected_affiliate_url: string;
  image_url: string;
  price_now_text: string;
  category_path: string;
  product_id: string;
  provenance: {
    provider: "coupang_partners_product_search";
    schedule_id: string;
    slot_id: CommerceDailySlotId;
    event_id: string;
    keyword: string;
    collected_at: string;
    response_fingerprint_sha256: string;
  };
};

export type ScheduledProductSearchResult =
  | {
      ok: true;
      products: AuthoritativeScheduledProduct[];
      external_api_called: true;
      automatic_retry_attempted: false;
      safe_summary: ReturnType<typeof buildScheduledProductPlan>["safe_summary"];
    }
  | {
      ok: false;
      blocker: string;
      products: [];
      external_api_called: boolean;
      automatic_retry_attempted: false;
      safe_summary: ReturnType<typeof buildScheduledProductPlan>["safe_summary"];
    };

export function buildScheduledProductPlan(input: {
  slotId: CommerceDailySlotId;
  now?: string | Date;
  env?: Record<string, string | undefined>;
}) {
  const now = input.now ?? new Date();
  const slot = getCommerceDailySlot(input.slotId);
  const window = buildRollingEventWindow({ today: now });
  const events = rankScheduledEvents(listCommerceEventsForWindow(window), window.startDate);
  const selectedEvent = events[slot.product_rank] ?? events[0] ?? null;
  const keywords = selectedEvent ? scheduledKoreanKeywords(selectedEvent.eventId, selectedEvent.type) : [];
  const uniqueKeywords = [...new Set(keywords.map((value) => value.trim()).filter(Boolean))].slice(0, 6);
  const request = buildCoupangPartnersSearchRequest({
    env: input.env ?? {},
    keyword: uniqueKeywords[0] ?? "",
    limit: 10
  });
  return {
    schedule_id: buildCommerceDailyScheduleId({ date: now, slotId: input.slotId }),
    slot,
    event_window: window,
    selected_event: selectedEvent,
    search_keywords: uniqueKeywords,
    request,
    safe_summary: {
      schedule_id: buildCommerceDailyScheduleId({ date: now, slotId: input.slotId }),
      slot_id: slot.id,
      event_id: selectedEvent?.eventId ?? "",
      provider_ready: request.ok,
      credential_values_exposed: false,
      raw_coupang_url_exposed: false,
      affiliate_url_exposed: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    }
  };
}

export async function searchScheduledProducts(input: {
  slotId: CommerceDailySlotId;
  approval?: string;
  now?: string | Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<ScheduledProductSearchResult> {
  const safePlan = buildScheduledProductPlan({ slotId: input.slotId, now: input.now, env: {} });
  if (input.approval !== COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL) {
    return blocked("COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL_REQUIRED", safePlan.safe_summary, false);
  }
  const plan = buildScheduledProductPlan(input);
  if (!plan.request.ok) {
    return blocked(plan.request.blocker, plan.safe_summary, false);
  }

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(plan.request.request.url, {
      method: plan.request.request.method,
      headers: plan.request.request.headers
    });
  } catch {
    return blocked("COUPANG_SCHEDULED_PRODUCT_SEARCH_FAILED", plan.safe_summary, true);
  }
  if (!response.ok) {
    return blocked(
      response.status === 401
        ? "COUPANG_SCHEDULED_PRODUCT_SEARCH_HTTP_401"
        : "COUPANG_SCHEDULED_PRODUCT_SEARCH_HTTP_ERROR",
      plan.safe_summary,
      true
    );
  }
  const payload = await response.json().catch(() => null);
  const products = normalizeProducts(payload, plan, input.now ?? new Date());
  if (products.length === 0) {
    return blocked("COUPANG_SCHEDULED_PRODUCT_CANDIDATES_EMPTY", plan.safe_summary, true);
  }
  return {
    ok: true,
    products,
    external_api_called: true,
    automatic_retry_attempted: false,
    safe_summary: plan.safe_summary
  };
}

function normalizeProducts(
  payload: unknown,
  plan: ReturnType<typeof buildScheduledProductPlan>,
  collectedAt: string | Date
) {
  const collectedAtIso = (collectedAt instanceof Date ? collectedAt : new Date(collectedAt)).toISOString();
  const keyword = plan.search_keywords[0] ?? "";
  const products = collectObjects(payload).flatMap((record): AuthoritativeScheduledProduct[] => {
    const productName = firstString(record, ["productName", "product_name", "title", "name"]);
    const productId = firstString(record, ["productId", "product_id"]);
    const affiliateUrl = firstString(record, ["productUrl", "product_url", "landingUrl", "landing_url"]);
    const imageUrl = firstString(record, ["productImage", "product_image", "imageUrl", "image_url"]);
    if (
      !productName ||
      !productId ||
      !/^\d+$/.test(productId) ||
      !isHttpsHost(affiliateUrl, "link.coupang.com") ||
      !isHttpsUrl(imageUrl)
    ) {
      return [];
    }
    const rawUrl = `https://www.coupang.com/vp/products/${productId}`;
    const price = firstNumber(record, ["productPrice", "product_price", "price"]);
    const category = firstString(record, ["categoryName", "category_name", "category"]) ?? "";
    return [{
      product_name: productName,
      raw_coupang_url: rawUrl,
      selected_affiliate_url: affiliateUrl!,
      image_url: imageUrl!,
      price_now_text: price === null ? "" : `${price.toLocaleString("ko-KR")}원`,
      category_path: category,
      product_id: productId,
      provenance: {
        provider: "coupang_partners_product_search",
        schedule_id: plan.schedule_id,
        slot_id: plan.slot.id,
        event_id: plan.selected_event?.eventId ?? "",
        keyword,
        collected_at: collectedAtIso,
        response_fingerprint_sha256: createHash("sha256")
          .update(`${productId}\0${productName}\0${affiliateUrl}`, "utf8")
          .digest("hex")
      }
    }];
  });
  return [...new Map(products.map((product) => [product.product_id, product])).values()].slice(0, 10);
}

function blocked(
  blocker: string,
  safeSummary: ReturnType<typeof buildScheduledProductPlan>["safe_summary"],
  externalApiCalled: boolean
): ScheduledProductSearchResult {
  return {
    ok: false,
    blocker,
    products: [],
    external_api_called: externalApiCalled,
    automatic_retry_attempted: false,
    safe_summary: safeSummary
  };
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(collectObjects);
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(collectObjects)];
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

function isHttpsUrl(value: string | null) {
  try {
    return Boolean(value && new URL(value).protocol === "https:");
  } catch {
    return false;
  }
}

function isHttpsHost(value: string | null, host: string) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && (url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

function scheduledKoreanKeywords(eventId: string, eventType: string) {
  const presets: Record<string, string[]> = {
    "rainy-season": ["제습기", "신발 건조기", "빨래 건조대", "방수 커버"],
    "summer-prep": ["에어 서큘레이터", "냉감 패드", "차량용 햇빛가리개"],
    "summer-vacation": ["방수 가방", "보냉 가방", "휴대용 선풍기"],
    "summer-break-start": ["아동 책상 정리", "미술 도구", "보드게임"],
    "summer-break-end": ["책상 정리함", "문구 세트", "가방 정리"],
    chobok: ["휴대용 선풍기", "냉감 패드", "여름 주방용품"],
    jungbok: ["휴대용 선풍기", "아이스 텀블러", "실내 냉감용품"],
    malbok: ["보냉 가방", "냉감 이불", "주방 보관용기"],
    "camping-season": ["캠핑 의자", "보냉 가방", "차량용 정리함"],
    "fall-camping": ["캠핑 조명", "차량용 정리함", "방수 가방"],
    "parents-day": ["카네이션", "감사 카드", "보온병"],
    "teachers-day": ["감사 카드", "문구 선물", "텀블러"],
    "children-day": ["보드게임", "미술 도구", "문구 세트"],
    kimjang: ["김장 매트", "김치통", "주방 장갑"],
    csat: ["보온 도시락", "무릎 담요", "응원 문구"],
    "winter-prep": ["전기 담요", "가습기", "방풍 커튼"],
    "christmas-year-end": ["선물 포장", "무드등", "테이블 장식"]
  };
  return presets[eventId] ??
    (eventType === "school"
      ? ["문구 세트", "책상 정리함", "가방 정리"]
      : ["생활 정리용품", "주방 정리용품", "계절 생활용품"]);
}

function rankScheduledEvents(
  events: ReturnType<typeof listCommerceEventsForWindow>,
  today: string
) {
  return [...events].sort((left, right) => {
    const score = scheduledEventScore(right, today) - scheduledEventScore(left, today);
    if (score !== 0) return score;
    return eventStart(left).localeCompare(eventStart(right)) || left.eventId.localeCompare(right.eventId);
  });
}

function scheduledEventScore(
  event: ReturnType<typeof listCommerceEventsForWindow>[number],
  today: string
) {
  const start = eventStart(event);
  const end = event.dateRange?.end ?? event.date ?? start;
  const active = start <= today && today <= end;
  const daysUntil = Math.max(
    0,
    Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  );
  const weight =
    event.type === "school"
      ? 30
      : event.type === "holiday" || event.type === "anniversary"
        ? 25
        : event.type === "season" || event.type === "weather"
          ? 15
          : 10;
  return (active ? 100 : Math.max(0, 70 - daysUntil * 2)) + weight;
}

function eventStart(event: ReturnType<typeof listCommerceEventsForWindow>[number]) {
  return event.dateRange?.start ?? event.date ?? "9999-12-31";
}
