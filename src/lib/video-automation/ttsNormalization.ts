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

export function normalizeSpokenNarration(value: string): string {
  return normalizeKoreanTtsPronunciation(value.normalize("NFC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, " ")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/gu, "")
    .replace(/https?:\/\/\S+|www\.\S+/giu, " 링크 ")
    .replace(/(?:1\s*\+\s*)+1\s*=\s*(\d+)\s*개\s*구성/gu, "총 $1개 구성")
    .replace(/1\s*\+\s*1/gu, "원 플러스 원")
    .replace(/&/gu, " 앤드 ")
    .replace(/[×✕✖]/gu, " 곱하기 ")
    .replace(/\+/gu, " 플러스 ")
    .replace(/\//gu, " 또는 ")
    .replace(/~/gu, "에서")
    .replace(/[·_|]/gu, " ")
    .replace(/[()[\]{}]/gu, ", ")
    .replace(/(\d+(?:\.\d+)?)\s*cm\b/giu, "$1 센티미터")
    .replace(/(\d+(?:\.\d+)?)\s*mm\b/giu, "$1 밀리미터")
    .replace(/(\d+(?:\.\d+)?)\s*kg\b/giu, "$1 킬로그램")
    .replace(/(\d+(?:\.\d+)?)\s*l\b/giu, "$1 리터")
    .replace(/\b[A-Za-z]{1,}\s*[-_]?\s*\d{2,}\b/gu, " ")
    .replace(/✅/gu, " 확인 ")
    .replace(/❌/gu, " 제외 ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/\s+,/gu, ",")
    .replace(/,{2,}/gu, ","));
}

export function normalizeAsrRecoveryNarration(value: string): string {
  return normalize(normalizeSpokenNarration(value
    .replace(/\b[A-Za-z]+\b/gu, " ")
    .replace(/\//gu, " "))
    .replace(/\s+,/gu, ",")
    .replace(/,{2,}/gu, ","));
}

export function segmentSpokenNarration(value: string, maxCharacters = 120): string[] {
  const normalized = normalizeSpokenNarration(value);
  const sentences = normalized.match(/[^.!?]+[.!?]?/gu)?.map((entry) => normalize(entry)).filter(Boolean) ?? [];
  const segments: string[] = [];
  for (const sentence of sentences) {
    if ([...sentence].length <= maxCharacters) { segments.push(sentence); continue; }
    const clauses = sentence.split(/(?<=,)/u)
      .map((entry) => normalize(entry))
      .filter(Boolean)
      .flatMap((clause) => chunkAtWordBoundaries(clause, maxCharacters));
    let current = "";
    for (const clause of clauses) {
      const combined = normalize(`${current} ${clause}`);
      if (!current || [...combined].length <= maxCharacters) { current = combined; continue; }
      segments.push(current); current = clause;
    }
    if (current) segments.push(current);
  }
  return segments;
}

function chunkAtWordBoundaries(value: string, maxCharacters: number): string[] {
  if ([...value].length <= maxCharacters) return [value];
  const chunks: string[] = [];
  let current = "";
  for (const word of value.split(/\s+/u).filter(Boolean)) {
    const combined = normalize(`${current} ${word}`);
    if (!current || [...combined].length <= maxCharacters) { current = combined; continue; }
    chunks.push(current);
    current = word;
  }
  if (current) chunks.push(current);
  return chunks;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/gu, " ").replace(/\s+([.!?])/gu, "$1");
}
