export function buildKoreanProductNarration(input: { canonicalProductName: string; hook: string; script: string }): string {
  const productName = normalize(input.canonicalProductName);
  const hook = normalize(input.hook);
  const script = normalize(input.script);
  if (!productName || !hook || !script) throw new Error("VIDEO_AUTOMATION_NARRATION_INPUT_REQUIRED");
  return normalizeKoreanTtsPronunciation(`상품명은 ${productName}입니다. ${hook} ${script}`);
}

/** Display/metadata identity stays canonical; only the TTS input receives pronunciation cues. */
export function buildKoreanProductNarrationPlan(input: { canonicalProductName: string; hook: string; script: string }): {
  canonicalProductName: string;
  pronunciationProductName: string;
  narration: string;
} {
  const productName = normalize(input.canonicalProductName);
  const hook = normalize(input.hook);
  const script = normalize(input.script);
  if (!productName || !hook || !script) throw new Error("VIDEO_AUTOMATION_NARRATION_INPUT_REQUIRED");
  const pronunciationProductName = normalizeProductNameForPronunciation(productName);
  const spokenScript = replaceCanonicalProductName(script, productName, pronunciationProductName);
  const spokenHook = replaceCanonicalProductName(hook, productName, pronunciationProductName);
  return {
    canonicalProductName: productName,
    pronunciationProductName,
    narration: normalizeKoreanTtsPronunciation(`상품명은 ${pronunciationProductName}입니다. ${spokenHook} ${spokenScript}`)
  };
}

export function normalizeProductNameForPronunciation(canonicalProductName: string): string {
  return normalize(canonicalProductName)
    .replace(/EasyBuy/gu, "이지바이")
    .replace(/접이식/gu, "접이식,")
    .replace(/행거/gu, "행거,")
    .replace(/스테인리스/gu, "스테인리스,")
    .replace(/슬랩/gu, "슬랩,")
    .replace(/분리수납함/gu, "분리 수납함");
}

function replaceCanonicalProductName(value: string, canonical: string, pronunciation: string): string {
  return value.split(canonical).join(pronunciation);
}

export function normalizeKoreanTtsPronunciation(value: string): string {
  return normalize(value).replace(/컵홀더/gu, "컵 홀더").replace(/3가지/gu, "세 가지");
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
