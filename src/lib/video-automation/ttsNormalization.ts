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
    .replace(/분리수납함/gu, "분리 수납함")
    .replace(/[,，]$/u, "");
}

/** Restore display identity for caption text; this never certifies what the audio actually says. */
export function restoreCanonicalDisplayNarration(spokenNarration: string, canonicalProductName: string, pronunciationProductName: string): string {
  const canonical = normalize(canonicalProductName);
  const pronunciation = normalize(pronunciationProductName);
  if (!canonical || !pronunciation || !spokenNarration.includes(pronunciation)) throw new Error("CAPTION_NARRATION_PRODUCT_IDENTITY_MISSING");
  return spokenNarration.split(pronunciation).join(canonical);
}

function replaceCanonicalProductName(value: string, canonical: string, pronunciation: string): string {
  const parts = value.split(canonical);
  if (parts.length === 1) return value;
  const last = canonical.codePointAt(canonical.length - 1) ?? 0;
  const coda = last >= 0xac00 && last <= 0xd7a3 ? (last - 0xac00) % 28 : null;
  let result = parts[0];
  for (const suffix of parts.slice(1)) {
    const corrected = suffix.replace(/^(으로|로|을|를)/u, (particle) => {
      if (coda === null) return particle;
      if (particle === "으로" || particle === "로") return coda === 0 || coda === 8 ? "로" : "으로";
      return coda === 0 ? "를" : "을";
    });
    result += pronunciation + corrected;
  }
  return result;
}

export function normalizeKoreanTtsPronunciation(value: string): string {
  return normalize(value).replace(/컵홀더/gu, "컵 홀더").replace(/3가지/gu, "세 가지");
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}
