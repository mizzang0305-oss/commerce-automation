import type { GeneratedContent, ProductQueueItem } from "@/types/automation";

export const DEFAULT_DISCLOSURE_TEXT =
  "이 콘텐츠는 제휴마케팅 활동을 포함하며, 링크를 통한 구매가 발생하면 작성자에게 수수료가 지급됩니다.";

export function buildDisclosureText() {
  return DEFAULT_DISCLOSURE_TEXT;
}

export function buildVideoTitle(item: ProductQueueItem, content?: GeneratedContent | null) {
  const existing = content?.video_title?.trim();
  if (existing) {
    return existing;
  }

  const angle = item.video_angle.trim() || item.category_path.trim() || item.keyword.trim();
  return clipText(`${item.product_name.trim()} 살펴보기${angle ? ` - ${angle}` : ""}`, 80);
}

export function buildVideoScript(item: ProductQueueItem, content?: GeneratedContent | null) {
  const existing = content?.video_script?.trim();
  if (existing) {
    return existing;
  }

  const productName = item.product_name.trim();
  const keyword = item.keyword.trim();
  const category = item.category_path.trim();
  const price = item.price_now_text.trim();
  const angle = item.video_angle.trim();
  const theme = item.theme.trim();
  const disclosure = buildDisclosureText();
  const context = [category, theme, keyword].filter(Boolean).join(" / ");

  return [
    `${keyword || category || "일상용품"}을 고를 때 무엇을 먼저 봐야 할지 고민이라면 이 상품을 체크해 보세요.`,
    `${productName}은 ${context || "사용 목적"}에 맞춰 비교해 볼 만한 후보입니다.`,
    angle ? `영상에서는 ${angle} 관점으로 실제 구매 전 확인할 포인트를 짚어봅니다.` : "영상에서는 사용 목적, 구성, 가격 정보를 차례로 확인합니다.",
    price ? `현재 표시된 가격은 ${price}이며, 가격과 혜택은 시점에 따라 달라질 수 있습니다.` : "가격과 혜택은 시점에 따라 달라질 수 있습니다.",
    "구매 전에는 상품 페이지에서 옵션, 배송, 반품 조건, 최신 리뷰를 직접 확인하세요.",
    disclosure
  ].join("\n");
}

export function buildYoutubeDescription(item: ProductQueueItem, content?: GeneratedContent | null) {
  const existing = content?.youtube_description?.trim();
  if (existing) {
    return existing;
  }

  return [
    `${item.product_name.trim()}를 짧게 살펴보는 영상입니다.`,
    item.price_now_text.trim() ? `표시 가격: ${item.price_now_text.trim()}` : "",
    "구매 전 상품 페이지에서 가격, 옵션, 배송, 반품 조건을 다시 확인하세요.",
    buildDisclosureText(),
    buildHashtags(item)
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildTiktokCaption(item: ProductQueueItem, content?: GeneratedContent | null) {
  const existing = content?.tiktok_caption?.trim();
  if (existing) {
    return existing;
  }

  return `${item.product_name.trim()} 구매 전 확인 포인트. 가격과 옵션은 상품 페이지에서 다시 확인하세요. ${buildHashtags(item)}`;
}

export function buildHashtags(item: ProductQueueItem) {
  const tags = [
    item.category_path,
    item.keyword,
    item.theme,
    "상품정보",
    "쇼핑체크"
  ]
    .flatMap((value) => value.split(/[/>|,\s]+/))
    .map(toHashtag)
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(tags)).slice(0, 8).join(" ");
}

export function buildDraftGeneratedContent(
  item: ProductQueueItem,
  content?: GeneratedContent | null,
  now = new Date().toISOString()
): GeneratedContent {
  const title = buildVideoTitle(item, content);
  const script = buildVideoScript(item, content);
  const disclosure = content?.disclosure_text?.trim() || buildDisclosureText();
  const hashtags = content?.hashtags?.trim() || buildHashtags(item);
  const youtubeDescription = buildYoutubeDescription(item, content);
  const tiktokCaption = buildTiktokCaption(item, content);
  const shortCaption = clipText(`${item.product_name.trim()} 구매 전 체크 포인트`, 80);

  return {
    id: content?.id || `content-${item.id}`,
    product_queue_id: item.id,
    raw_coupang_url: item.raw_coupang_url,
    product_name: item.product_name,
    selected_affiliate_url: item.selected_affiliate_url,
    video_title: title,
    video_script: script,
    caption_1: content?.caption_1?.trim() || shortCaption,
    caption_2: content?.caption_2?.trim() || "가격, 옵션, 배송 조건은 구매 전 다시 확인하세요.",
    caption_3: content?.caption_3?.trim() || "제휴 링크가 포함된 콘텐츠입니다.",
    threads_text: content?.threads_text?.trim() || `${shortCaption}\n${buildDisclosureText()}`,
    blog_title: content?.blog_title?.trim() || title,
    blog_body: content?.blog_body?.trim() || `${script}\n\n${youtubeDescription}`,
    hashtags,
    youtube_description: youtubeDescription,
    tiktok_caption: tiktokCaption,
    disclosure_text: disclosure,
    content_source: content?.content_source || "fallback",
    creatomate_render_id: content?.creatomate_render_id || "",
    video_url: content?.video_url || "",
    video_snapshot_url: content?.video_snapshot_url || "",
    video_status: content?.video_status || "not_started",
    blog_draft_url: content?.blog_draft_url || "",
    blog_draft_status: content?.blog_draft_status || "not_started",
    created_at: content?.created_at || now,
    updated_at: now
  };
}

function toHashtag(value: string) {
  const normalized = value.replace(/[^\p{L}\p{N}_-]/gu, "").trim();
  if (!normalized || normalized.length < 2) {
    return "";
  }
  return `#${normalized}`;
}

function clipText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
