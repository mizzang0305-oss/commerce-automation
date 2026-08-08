export function buildKoreanProductNarration(input: { canonicalProductName: string; hook: string; script: string }): string {
  const productName = normalize(input.canonicalProductName);
  const hook = normalize(input.hook);
  const script = normalize(input.script);
  if (!productName || !hook || !script) throw new Error("VIDEO_AUTOMATION_NARRATION_INPUT_REQUIRED");
  return `상품명은 ${productName}입니다. ${hook} ${script}`;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
