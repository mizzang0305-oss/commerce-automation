const REQUIRED_DISCLOSURE_KEYWORDS = ["쿠팡파트너스", "수수료"] as const;

export function validateYouTubeDisclosureText(input: {
  description?: string;
  caption?: string;
  disclosure_text: string;
}): string[] {
  const reasons: string[] = [];
  const disclosureText = input.disclosure_text.trim();
  const descriptionText = [input.description, input.caption].filter(Boolean).join("\n");

  if (looksLikeGarbledKorean(disclosureText) || looksLikeGarbledKorean(descriptionText)) {
    reasons.push("disclosure_text_garbled");
    return reasons;
  }

  const compactDisclosure = disclosureText.replace(/\s+/g, "");
  if (!REQUIRED_DISCLOSURE_KEYWORDS.every((keyword) => compactDisclosure.includes(keyword))) {
    reasons.push("disclosure_text_missing_required_korean");
  }

  return reasons;
}

export function looksLikeGarbledKorean(value: string) {
  const text = value.trim();
  if (!text) {
    return false;
  }

  if (/(^|\s)\?[\s?]{2,}/.test(text)) {
    return true;
  }

  const questionMarks = [...text].filter((char) => char === "?").length;
  const hangul = [...text].filter((char) => /[가-힣]/.test(char)).length;
  return questionMarks >= 4 && hangul === 0;
}
