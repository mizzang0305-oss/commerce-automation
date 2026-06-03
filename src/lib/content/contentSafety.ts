import type { ContentGenerationInput, ContentGenerationResult, ContentGenerationSafetyResult } from "@/lib/content/contentProviderTypes";

const PROHIBITED_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /최저가|최저\s*가격/i, label: "최저가 단정 표현" },
  { pattern: /보장|무조건|반드시|확실/i, label: "보장성 표현" },
  { pattern: /100\s*%|백\s*퍼센트/i, label: "100% 단정 표현" },
  { pattern: /치료|효능|의학|질병|완치/i, label: "의료/건강 효능 단정 표현" },
  { pattern: /리뷰\s*원문|후기\s*원문/i, label: "리뷰 원문 복사 의심 표현" }
];

export function validateContentGenerationSafety(
  result: ContentGenerationResult,
  input: ContentGenerationInput
): ContentGenerationSafetyResult {
  const warnings: string[] = [];
  const text = [
    result.video_title,
    result.video_script,
    result.youtube_description,
    result.tiktok_caption,
    result.caption_1,
    result.caption_2,
    result.caption_3
  ].join("\n");

  for (const rule of PROHIBITED_PATTERNS) {
    if (rule.pattern.test(text)) {
      warnings.push(rule.label);
    }
  }

  if (!input.queue_item.product_name.trim()) {
    warnings.push("product_name 누락");
  }
  if (!input.queue_item.selected_affiliate_url.trim()) {
    warnings.push("selected_affiliate_url 누락");
  }
  if (!result.disclosure_text.trim()) {
    warnings.push("disclosure_text 누락");
  }
  if (result.video_script.trim().length < 40) {
    warnings.push("video_script가 너무 짧음");
  }
  if (result.video_script.length > 1800) {
    warnings.push("video_script가 너무 김");
  }
  if (result.hashtags.split(/\s+/).filter(Boolean).length > 12) {
    warnings.push("hashtags가 너무 많음");
  }

  const blocked = warnings.some((warning) =>
    /단정|보장|100%|의료|리뷰 원문|누락|너무 짧음/.test(warning)
  );

  return {
    ok: !blocked,
    blocked,
    warnings,
    safe_message: blocked
      ? "콘텐츠 안전 검수에서 차단 조건이 발견되었습니다."
      : "콘텐츠 안전 검수를 통과했습니다."
  };
}
