export function buildKoreanProductNarration(input: { canonicalProductName: string; hook: string; script: string }): string {
  const productName = normalize(input.canonicalProductName);
  const hook = normalize(input.hook);
  const script = normalize(input.script);
  if (!productName || !hook || !script) throw new Error("VIDEO_AUTOMATION_NARRATION_INPUT_REQUIRED");
  return normalizeKoreanTtsPronunciation(`상품명은 ${productName}입니다. ${hook} ${script}`);
}

export function normalizeKoreanTtsPronunciation(value: string): string {
  return normalize(value).replace(/컵홀더/gu, "컵 홀더").replace(/3가지/gu, "세 가지");
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
