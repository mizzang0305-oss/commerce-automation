import type { AutomationRepository } from "@/lib/repositories/types";
import { buildDraftGeneratedContent } from "@/lib/content/contentTemplate";
import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import {
  searchScheduledProducts,
  type AuthoritativeScheduledProduct
} from "@/lib/coupang/scheduledProductProvider";
import type { CommerceDailySlotId } from "@/lib/orchestration/commerceDailyCadence";

export const SCHEDULED_AFFILIATE_DISCLOSURE_TEXT =
  "이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

export type ScheduledQueueIntegrationResult =
  | {
      ok: true;
      candidate_id: string;
      queue_id: string;
      content_id: string;
      queue_status: "scheduled";
      selected_affiliate_url_present: true;
      disclosure_text_present: true;
      raw_coupang_url_exposed: false;
      external_api_called: boolean;
      worker_job_created: false;
      upload_executor_called: false;
      videos_insert_called: false;
    }
  | {
      ok: false;
      blocker: string;
      external_api_called: boolean;
      worker_job_created: false;
      upload_executor_called: false;
      videos_insert_called: false;
    };

export async function runScheduledQueueIntegration(input: {
  repository: AutomationRepository;
  slotId: CommerceDailySlotId;
  approval?: string;
  now?: string | Date;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  disclosureText?: string;
}): Promise<ScheduledQueueIntegrationResult> {
  const disclosureText = (input.disclosureText ?? SCHEDULED_AFFILIATE_DISCLOSURE_TEXT).trim();
  if (!disclosureText) {
    return blocked("DISCLOSURE_TEXT_REQUIRED", false);
  }

  const search = await searchScheduledProducts({
    slotId: input.slotId,
    approval: input.approval,
    now: input.now,
    env: input.env,
    fetchImpl: input.fetchImpl
  });
  if (!search.ok) {
    return blocked(search.blocker, search.external_api_called);
  }

  const existingCandidates = await input.repository.getProductCandidates();
  const queueItems = await input.repository.getQueue();
  const kstDate = search.safe_summary.schedule_id.slice("commerce-daily-".length, "commerce-daily-".length + 10);

  for (const product of search.products) {
    const built = toCandidate(product, existingCandidates);
    if (!built.candidate.selected_affiliate_url.trim()) continue;
    if (existingCandidates.some((candidate) => candidate.product_key === built.candidate.product_key)) continue;
    if (
      queueItems.some(
        (item) =>
          item.queue_date === kstDate &&
          normalizeName(item.product_name) === normalizeName(built.candidate.product_name)
      )
    ) {
      continue;
    }

    await input.repository.upsertProductCandidates([built.candidate]);
    const promotion = await input.repository.promoteCandidateToQueue(built.candidate.id, {
      now: toIso(input.now),
      scheduled_at: toIso(input.now)
    });
    if (!promotion.queue_item.selected_affiliate_url.trim()) {
      return blocked("AFFILIATE_DEEPLINK_REQUIRED", search.external_api_called);
    }
    const content = buildDraftGeneratedContent(
      promotion.queue_item,
      promotion.content,
      toIso(input.now),
      buildScheduledKoreanContent(product, disclosureText)
    );
    if (!content.disclosure_text.trim()) {
      return blocked("DISCLOSURE_TEXT_REQUIRED", search.external_api_called);
    }
    await input.repository.upsertGeneratedContent(content);
    return {
      ok: true,
      candidate_id: promotion.candidate.id,
      queue_id: promotion.queue_item.id,
      content_id: content.id,
      queue_status: "scheduled",
      selected_affiliate_url_present: true,
      disclosure_text_present: true,
      raw_coupang_url_exposed: false,
      external_api_called: search.external_api_called,
      worker_job_created: false,
      upload_executor_called: false,
      videos_insert_called: false
    };
  }
  return blocked("DUPLICATE_PRODUCT_OR_SAME_DAY_DUPLICATE", search.external_api_called);
}

function toCandidate(
  product: AuthoritativeScheduledProduct,
  existingCandidates: Awaited<ReturnType<AutomationRepository["getProductCandidates"]>>
) {
  const built = buildCoupangCandidate(
    {
      product_name: product.product_name,
      raw_coupang_url: product.raw_coupang_url,
      selected_affiliate_url: product.selected_affiliate_url,
      image_url: product.image_url,
      price_now_text: product.price_now_text,
      category_path: product.category_path,
      source_type: "scheduled_provider",
      source: product.provenance.provider
    },
    { candidates: existingCandidates }
  );
  built.candidate.payload = {
    ...built.candidate.payload,
    keyword: product.provenance.keyword,
    scheduled_provider_provenance: product.provenance
  };
  return built;
}

function blocked(blocker: string, externalApiCalled: boolean): ScheduledQueueIntegrationResult {
  return {
    ok: false,
    blocker,
    external_api_called: externalApiCalled,
    worker_job_created: false,
    upload_executor_called: false,
    videos_insert_called: false
  };
}

function normalizeName(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function buildScheduledKoreanContent(product: AuthoritativeScheduledProduct, disclosureText: string) {
  const productName = product.product_name.trim();
  const keyword = product.provenance.keyword.trim();
  const context = keyword || product.category_path.trim() || "생활 활용";
  const priceLine = product.price_now_text
    ? `현재 표시 가격은 ${product.price_now_text}이며 옵션과 가격은 구매 시점에 다시 확인하세요.`
    : "옵션과 가격은 구매 시점에 상품 페이지에서 다시 확인하세요.";
  const script = [
    `${context} 준비 중이라면 ${productName}을 20초 안에 확인해 보세요.`,
    `실제 사용 장면에서 크기와 사용 동선을 먼저 확인합니다.`,
    `구성품과 설치 공간, 소음, 관리 방법을 차례로 확인합니다.`,
    priceLine,
    "배송과 반품 조건, 최신 구매 후기를 확인한 뒤 결정하세요.",
    disclosureText
  ].join("\n");
  return {
    video_title: `${productName} 20초 구매 체크`,
    video_script: script,
    caption_1: `${productName} 핵심 사용 장면`,
    caption_2: "크기·동선·관리 방법 확인",
    caption_3: "가격·배송·반품 조건은 구매 전 재확인",
    threads_text: `${productName} 구매 전 실제 사용 장면과 조건을 확인하세요.\n${disclosureText}`,
    blog_title: `${productName} 구매 전 체크리스트`,
    blog_body: script,
    youtube_description: [
      `${productName}의 실제 사용 장면과 구매 전 확인 항목을 정리했습니다.`,
      priceLine,
      disclosureText,
      "#상품체크 #쿠팡파트너스"
    ].join("\n\n"),
    tiktok_caption: `${productName} 구매 전 실제 사용 장면부터 확인하세요. #상품체크`,
    hashtags: "#상품체크 #쿠팡파트너스",
    disclosure_text: disclosureText,
    content_source: "fallback" as const
  };
}

function toIso(value: string | Date | undefined) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error("SCHEDULED_QUEUE_DATE_INVALID");
  return date.toISOString();
}
