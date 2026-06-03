import {
  buildDisclosureText,
  buildHashtags,
  buildTiktokCaption,
  buildVideoScript,
  buildVideoTitle,
  buildYoutubeDescription
} from "@/lib/content/contentTemplate";
import type { ContentGenerationInput, ContentGenerationResult } from "@/lib/content/contentProviderTypes";

export async function generateTemplateContent(input: ContentGenerationInput): Promise<ContentGenerationResult> {
  const item = input.queue_item;
  const content = input.existing_content ?? null;
  const title = buildVideoTitle(item, content);
  const script = buildVideoScript(item, content);
  const disclosure = content?.disclosure_text?.trim() || buildDisclosureText();
  const hashtags = content?.hashtags?.trim() || buildHashtags(item);

  return {
    provider: "template",
    requested_provider: "template",
    provider_configured: false,
    used_fallback: false,
    video_title: title,
    video_script: script,
    caption_1: content?.caption_1?.trim() || `${item.product_name.trim()} 구매 전 체크 포인트`,
    caption_2: content?.caption_2?.trim() || "가격, 옵션, 배송 조건은 구매 전 다시 확인하세요.",
    caption_3: content?.caption_3?.trim() || "제휴 링크가 포함된 콘텐츠입니다.",
    threads_text: content?.threads_text?.trim() || `${item.product_name.trim()} 구매 전 체크 포인트\n${disclosure}`,
    blog_title: content?.blog_title?.trim() || title,
    blog_body: content?.blog_body?.trim() || `${script}\n\n${buildYoutubeDescription(item, content)}`,
    youtube_description: buildYoutubeDescription(item, content),
    tiktok_caption: buildTiktokCaption(item, content),
    hashtags,
    disclosure_text: disclosure,
    safety_warnings: [],
    safe_message: "template content generated"
  };
}
