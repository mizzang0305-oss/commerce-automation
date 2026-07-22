import {
  V112_CHANNEL_KEY,
  V112_PRODUCT_REFERENCE,
  V112_SCENE_PLAN
} from "./v112ImageSkillVisualQuality";

export const V113_CHANNEL_KEY = V112_CHANNEL_KEY;
export const V113_PRODUCT_REFERENCE = V112_PRODUCT_REFERENCE;
export const V113_TARGET_DURATION_SECONDS = 22.7;
export const V113_TARGET_VOICE_DURATION_SECONDS = 21.4;
export const V113_VOICE_STYLE = "energetic_sales" as const;
export const V113_VOICE_SPEED_MULTIPLIER = 1.14;

export const V113_SCRIPT_SEGMENTS = [
  "뒷좌석이 자꾸 지저분해진다면 이거 하나 보세요",
  "양쪽 컵홀더와 티슈 수납,",
  "물병과 작은 소품까지 한 번에 정리합니다",
  "가운데 거울은 필요할 때 바로 펼치고",
  "아래 걸이에는 가방과 우산까지 걸 수 있어요",
  "구매 전 헤드레스트 고정 방식과 차량 시트 간격을 확인하고, 제품 정보는 고정 댓글 링크에서 확인하세요"
] as const;

export const V113_VOICEOVER_SCRIPT = V113_SCRIPT_SEGMENTS.join(" ");

export const V113_REQUIRED_PRODUCT_ANCHORS = [
  "뒷좌석",
  "컵홀더",
  "티슈",
  "거울",
  "가방",
  "우산",
  "헤드레스트",
  "시트"
] as const;

export const V113_FORBIDDEN_MISMATCH_TERMS = [
  "프론트콘솔",
  "기어봉",
  "콘솔 틈새",
  "운전석 앞",
  "앞좌석 사이"
] as const;

export const V113_REQUIRED_PINNED_COMMENT_CTA_ANCHORS = ["고정 댓글", "링크"] as const;

export function validateV113ProductMatchedScript(script = V113_VOICEOVER_SCRIPT) {
  const normalized = normalizeKoreanText(script);
  const missingAnchors = V113_REQUIRED_PRODUCT_ANCHORS.filter(
    (anchor) => !normalized.includes(normalizeKoreanText(anchor))
  );
  const forbiddenTermsFound = V113_FORBIDDEN_MISMATCH_TERMS.filter(
    (term) => normalized.includes(normalizeKoreanText(term))
  );
  const missingPinnedCommentCtaAnchors = V113_REQUIRED_PINNED_COMMENT_CTA_ANCHORS.filter(
    (anchor) => !normalized.includes(normalizeKoreanText(anchor))
  );
  const blockers = [
    V113_SCRIPT_SEGMENTS.length !== V112_SCENE_PLAN.length
      ? "BLOCKED_V113_SCRIPT_SCENE_COUNT_MISMATCH"
      : null,
    script.length < 80 || script.length > 180
      ? "BLOCKED_V113_SCRIPT_LENGTH_INVALID"
      : null,
    missingAnchors.length > 0
      ? "BLOCKED_V113_PRODUCT_ANCHORS_MISSING"
      : null,
    forbiddenTermsFound.length > 0
      ? "BLOCKED_V113_PRODUCT_MISMATCH_COPY"
      : null,
    missingPinnedCommentCtaAnchors.length > 0
      ? "BLOCKED_V113_PINNED_COMMENT_CTA_MISSING"
      : null
  ].filter((blocker): blocker is string => Boolean(blocker));

  return {
    version: "v113" as const,
    channelKey: V113_CHANNEL_KEY,
    productReference: V113_PRODUCT_REFERENCE,
    scriptSegmentCount: V113_SCRIPT_SEGMENTS.length,
    scriptCharacterCount: script.length,
    missingAnchors,
    forbiddenTermsFound,
    missingPinnedCommentCtaAnchors,
    pinnedCommentCtaPresent: missingPinnedCommentCtaAnchors.length === 0,
    pinnedCommentCreated: false,
    productMatched: blockers.length === 0,
    blockers,
    ready: blockers.length === 0,
    voiceOwnerReviewRequired: true,
    voiceStyle: V113_VOICE_STYLE,
    voiceSpeedMultiplier: V113_VOICE_SPEED_MULTIPLIER,
    targetVoiceDurationSeconds: V113_TARGET_VOICE_DURATION_SECONDS,
    replacementUploadReady: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

export function normalizeV113AsrTranscript(value: string) {
  return value
    .replace(/컵\s*홀더/gu, "컵홀더")
    .replace(/헤드\s*레스트/gu, "헤드레스트")
    .replace(/티\s*슈/gu, "티슈")
    .replace(/\s+/gu, " ")
    .trim();
}

export function calculateV113TranscriptSimilarity(reference: string, actual: string) {
  const expected = normalizeKoreanText(reference);
  const received = normalizeKoreanText(normalizeV113AsrTranscript(actual));
  if (!expected || !received) return 0;
  const expectedCharacters = [...new Set([...expected])];
  const receivedCharacters = new Set([...received]);
  const matches = expectedCharacters.filter((character) => receivedCharacters.has(character)).length;
  return round3(matches / expectedCharacters.length);
}

export function findV113RecognizedAnchors(transcript: string) {
  const normalized = normalizeKoreanText(normalizeV113AsrTranscript(transcript));
  return V113_REQUIRED_PRODUCT_ANCHORS.filter(
    (anchor) => normalized.includes(normalizeKoreanText(anchor))
  );
}

function normalizeKoreanText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]+/gu, "");
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}
