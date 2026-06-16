const ZERO_WIDTH_CHARACTERS = /[\u200B-\u200D\uFEFF]/g;

export function validateYouTubeDisclosureText(input: {
  description?: string;
  caption?: string;
  disclosure_text: string;
}): string[] {
  const reasons: string[] = [];
  const disclosureText = normalizeKoreanDisclosureText(input.disclosure_text);
  const descriptionText = normalizeKoreanDisclosureText([input.description, input.caption].filter(Boolean).join("\n"));

  if (looksLikeGarbledKorean(disclosureText) || looksLikeGarbledKorean(descriptionText)) {
    reasons.push("disclosure_text_garbled");
    return reasons;
  }

  if (!hasRequiredCoupangPartnersDisclosure(disclosureText)) {
    reasons.push("disclosure_text_missing_required_korean");
  }

  return reasons;
}

export function normalizeKoreanDisclosureText(value: string) {
  return decodeBasicHtmlEntities(value)
    .normalize("NFKC")
    .replace(ZERO_WIDTH_CHARACTERS, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function hasRequiredCoupangPartnersDisclosure(value: string) {
  const compactDisclosure = normalizeKoreanDisclosureText(value).replace(/\s+/g, "");
  const hasCoupangPartners = compactDisclosure.includes("쿠팡파트너스");
  const hasAffiliateActivity = compactDisclosure.includes("활동") && compactDisclosure.includes("일환");
  const hasCommissionDisclosure =
    compactDisclosure.includes("수수료") &&
    (compactDisclosure.includes("제공받") ||
      compactDisclosure.includes("지급받") ||
      compactDisclosure.includes("받을수있"));

  return hasCoupangPartners && hasAffiliateActivity && hasCommissionDisclosure;
}

export function looksLikeGarbledKorean(value: string) {
  const text = normalizeKoreanDisclosureText(value);
  if (!text) {
    return false;
  }

  if (text.includes("\uFFFD") || /(^|\s)\?[\s?]{2,}/.test(text)) {
    return true;
  }

  const questionMarks = [...text].filter((char) => char === "?").length;
  const hangul = [...text].filter((char) => /[가-힣]/.test(char)).length;
  return questionMarks >= 4 && hangul === 0;
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}
