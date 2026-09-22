import { createHash } from "node:crypto";
import { buildRollingEventWindow, listCommerceEventsForWindow } from "@/lib/coupang/eventCalendar";
import { buildEventProductKeywordPlan } from "@/lib/coupang/eventProductKeywordPlanner";
import { buildCoupangPartnersSearchRequest } from "@/lib/coupang/partnersAuthConfig";
import { collectedProductSchema, type CollectedProduct } from "@/lib/orchestration/commercePocSchemas";
import {
  buildCommerceDailyScheduleId,
  getCommerceDailySlot,
  type CommerceDailySlotId
} from "@/lib/orchestration/commerceDailyCadence";

export type ScheduledEventProductProviderPlan = {
  mode: "korea_30d_event_coupang_provider_plan";
  schedule_id: string;
  slot: {
    id: CommerceDailySlotId;
    label: string;
    local_time: string;
    timezone: "Asia/Seoul";
    product_rank: number;
  };
  event_window: ReturnType<typeof buildRollingEventWindow>;
  selected_event: {
    id: string;
    name: string;
    type: string;
    source: string;
  } | null;
  search_keywords: string[];
  source_authorization_basis: "owned_channel";
  provider: {
    id: "coupang_partners_product_search";
    ready: boolean;
    blocker: string | null;
    external_api_call_allowed: false;
    external_api_called: false;
    process_credentials_read_by_plan: false;
    live_search_requires_separate_approval: true;
    raw_values_masked: true;
  };
  output: {
    local_plan_logged: true;
    owner_review_required: true;
    draft_created: false;
    publish_attempted: false;
    external_upload: false;
    database_write: false;
    product_queue_write: false;
    worker_job_created: false;
    SAFE_TO_UPLOAD: false;
    SAFE_TO_PUBLIC_UPLOAD: false;
  };
};

export const COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL = "APPROVE_COUPANG_SCHEDULED_PRODUCT_SEARCH";

export type ScheduledEventProductSearchResult = {
  ok: boolean;
  blocker:
    | "COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL_REQUIRED"
    | "COUPANG_SCHEDULED_PRODUCT_PROVIDER_NOT_READY"
    | "COUPANG_SCHEDULED_PRODUCT_SEARCH_HTTP_401"
    | "COUPANG_SCHEDULED_PRODUCT_SEARCH_HTTP_ERROR"
    | "COUPANG_SCHEDULED_PRODUCT_SEARCH_FAILED"
    | "COUPANG_SCHEDULED_PRODUCT_CANDIDATES_EMPTY"
    | null;
  plan: ScheduledEventProductProviderPlan;
  products: CollectedProduct[];
  external_api_called: boolean;
  credential_input_used: boolean;
  automatic_retry_attempted: false;
  local_pool_write_allowed: boolean;
  owner_review_required: true;
  publish_attempted: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

export type ScheduledEventProductPreviewItem = {
  schedule_id: string;
  slot: ScheduledEventProductProviderPlan["slot"];
  event: ScheduledEventProductProviderPlan["selected_event"];
  primary_keyword: string | null;
  product: CollectedProduct | null;
  owner_review_required: true;
  publish_connected: false;
};

export function buildScheduledEventProductPreview(input: {
  slotId: CommerceDailySlotId;
  products: CollectedProduct[];
  now?: string | Date;
}): ScheduledEventProductPreviewItem {
  const plan = buildScheduledEventProductProviderPlan({
    slotId: input.slotId,
    now: input.now,
    env: {}
  });
  return {
    schedule_id: plan.schedule_id,
    slot: plan.slot,
    event: plan.selected_event,
    primary_keyword: plan.search_keywords[0] ?? null,
    product: input.products[plan.slot.product_rank] ?? input.products[0] ?? null,
    owner_review_required: true,
    publish_connected: false
  };
}

export function buildScheduledEventProductProviderPlan(input: {
  slotId: CommerceDailySlotId;
  now?: string | Date;
  env?: Record<string, string | undefined>;
}): ScheduledEventProductProviderPlan {
  const now = input.now ?? new Date();
  const slot = getCommerceDailySlot(input.slotId);
  const eventWindow = buildRollingEventWindow({ today: now });
  const selectedEvent = rankProviderEvents(
    listCommerceEventsForWindow(eventWindow),
    eventWindow.startDate
  )[slot.product_rank] ?? null;
  const keywordPlan = selectedEvent ? buildEventProductKeywordPlan(selectedEvent) : null;
  const keywords = keywordPlan
    ? unique([...keywordPlan.primaryKeywords, ...keywordPlan.secondaryKeywords]).slice(0, 6)
    : [];
  const readiness = buildCoupangPartnersSearchRequest({
    env: input.env ?? {},
    keyword: keywords[0] ?? "",
    limit: 10
  });

  return {
    mode: "korea_30d_event_coupang_provider_plan",
    schedule_id: buildCommerceDailyScheduleId({ date: now, slotId: input.slotId }),
    slot: {
      id: slot.id,
      label: slot.label,
      local_time: slot.local_time,
      timezone: "Asia/Seoul",
      product_rank: slot.product_rank
    },
    event_window: eventWindow,
    selected_event: selectedEvent
      ? {
          id: selectedEvent.eventId,
          name: selectedEvent.name,
          type: selectedEvent.type,
          source: selectedEvent.source
        }
      : null,
    search_keywords: keywords,
    source_authorization_basis: "owned_channel",
    provider: {
      id: "coupang_partners_product_search",
      ready: readiness.ok,
      blocker: readiness.blocker,
      external_api_call_allowed: false,
      external_api_called: false,
      process_credentials_read_by_plan: false,
      live_search_requires_separate_approval: true,
      raw_values_masked: true
    },
    output: {
      local_plan_logged: true,
      owner_review_required: true,
      draft_created: false,
      publish_attempted: false,
      external_upload: false,
      database_write: false,
      product_queue_write: false,
      worker_job_created: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    }
  };
}

export async function searchScheduledEventProducts(input: {
  slotId: CommerceDailySlotId;
  approval?: string;
  now?: string | Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}): Promise<ScheduledEventProductSearchResult> {
  const safePlan = buildScheduledEventProductProviderPlan({ slotId: input.slotId, now: input.now, env: {} });
  if (input.approval !== COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL) {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL_REQUIRED", safePlan, false);
  }

  const plan = buildScheduledEventProductProviderPlan({
    slotId: input.slotId,
    now: input.now,
    env: input.env ?? {}
  });
  const keyword = plan.search_keywords[0] ?? "";
  const request = buildCoupangPartnersSearchRequest({ env: input.env ?? {}, keyword, limit: 10 });
  if (!request.ok) {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_PROVIDER_NOT_READY", plan, false, true);
  }

  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(request.request.url, {
      method: request.request.method,
      headers: request.request.headers
    });
  } catch {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_SEARCH_FAILED", plan, true, true);
  }
  if (response.status === 401) {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_SEARCH_HTTP_401", plan, true, true);
  }
  if (!response.ok) {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_SEARCH_HTTP_ERROR", plan, true, true);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_SEARCH_FAILED", plan, true, true);
  }
  const products = normalizeSearchProducts(payload, input.now ?? new Date());
  if (products.length === 0) {
    return blockedSearch("COUPANG_SCHEDULED_PRODUCT_CANDIDATES_EMPTY", plan, true, true);
  }

  return {
    ok: true,
    blocker: null,
    plan,
    products,
    external_api_called: true,
    credential_input_used: true,
    automatic_retry_attempted: false,
    local_pool_write_allowed: true,
    owner_review_required: true,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function blockedSearch(
  blocker: Exclude<ScheduledEventProductSearchResult["blocker"], null>,
  plan: ScheduledEventProductProviderPlan,
  externalApiCalled: boolean,
  credentialInputUsed = false
): ScheduledEventProductSearchResult {
  return {
    ok: false,
    blocker,
    plan,
    products: [],
    external_api_called: externalApiCalled,
    credential_input_used: credentialInputUsed,
    automatic_retry_attempted: false,
    local_pool_write_allowed: false,
    owner_review_required: true,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function normalizeSearchProducts(payload: unknown, collectedAt: string | Date) {
  const collectedAtIso = (collectedAt instanceof Date ? collectedAt : new Date(collectedAt)).toISOString();
  const products = collectObjects(payload).flatMap((record) => {
    const productName = firstString(record, ["productName", "product_name", "title", "name"]);
    const imageUrl = firstString(record, ["productImage", "product_image", "imageUrl", "image_url"]);
    const sourceUrl = firstString(record, ["productUrl", "product_url", "landingUrl", "landing_url", "url"]);
    if (!productName || !isHttpsUrl(imageUrl) || !isHttpsCoupangUrl(sourceUrl)) {
      return [];
    }
    const price = firstNumber(record, ["productPrice", "product_price", "price"]);
    const rawHash = createHash("sha256").update(`${productName}\0${sourceUrl}`).digest("hex");
    const parsed = collectedProductSchema.safeParse({
      schema_version: "1",
      product_name: productName,
      price,
      image_url: imageUrl,
      stock_status: "unknown",
      seller: "Coupang",
      collected_at: collectedAtIso,
      source_url: sourceUrl,
      raw_hash: rawHash
    });
    return parsed.success ? [parsed.data] : [];
  });
  return [...new Map(products.map((product) => [product.raw_hash, product])).values()].slice(0, 10);
}

function collectObjects(value: unknown): Record<string, unknown>[] {
  if (!value || typeof value !== "object") {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectObjects);
  }
  const record = value as Record<string, unknown>;
  return [record, ...Object.values(record).flatMap(collectObjects)];
}

function firstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(numeric) && numeric >= 0) {
      return numeric;
    }
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

function isHttpsCoupangUrl(value: string | null) {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && (url.hostname === "coupang.com" || url.hostname.endsWith(".coupang.com"));
  } catch {
    return false;
  }
}

function rankProviderEvents(
  events: ReturnType<typeof listCommerceEventsForWindow>,
  today: string
) {
  return [...events].sort((left, right) =>
    providerEventScore(right, today) - providerEventScore(left, today) ||
    eventStart(left).localeCompare(eventStart(right)) ||
    left.eventId.localeCompare(right.eventId)
  );
}

function providerEventScore(
  event: ReturnType<typeof listCommerceEventsForWindow>[number],
  today: string
) {
  const start = eventStart(event);
  const end = event.dateRange?.end ?? event.date ?? start;
  const active = start <= today && today <= end;
  const daysUntilStart = Math.max(0, Math.round(
    (Date.parse(`${start}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / 86_400_000
  ));
  const typeWeight = event.type === "school"
    ? 30
    : event.type === "holiday" || event.type === "anniversary"
      ? 25
      : event.type === "season" || event.type === "weather"
        ? 15
        : 10;
  return (active ? 100 : Math.max(0, 70 - daysUntilStart * 2)) + typeWeight;
}

function eventStart(event: ReturnType<typeof listCommerceEventsForWindow>[number]) {
  return event.dateRange?.start ?? event.date ?? "9999-12-31";
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
