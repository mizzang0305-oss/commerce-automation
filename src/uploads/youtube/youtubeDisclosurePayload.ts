export const V055_COUPANG_PARTNERS_DISCLOSURE =
  "※ 이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

export type V055YouTubeVideoInsertBody = {
  snippet: {
    title: string;
    description: string;
    categoryId: "26";
  };
  status: {
    privacyStatus: "public";
    selfDeclaredMadeForKids: false;
    containsSyntheticMedia: true;
  };
  paidProductPlacementDetails: {
    hasPaidProductPlacement: true;
  };
};

export function buildV055YouTubeVideoInsertBody(input: {
  title: string;
  description: string;
  madeForKids: false;
  visibility: "public";
  containsSyntheticMedia: true;
  containsPaidPromotion: true;
}): V055YouTubeVideoInsertBody {
  return {
    snippet: {
      title: input.title,
      description: ensureCoupangDisclosure(input.description),
      categoryId: "26"
    },
    status: {
      privacyStatus: input.visibility,
      selfDeclaredMadeForKids: input.madeForKids,
      containsSyntheticMedia: input.containsSyntheticMedia
    },
    paidProductPlacementDetails: {
      hasPaidProductPlacement: input.containsPaidPromotion
    }
  };
}

export function ensureCoupangDisclosure(value: string) {
  const text = value.trim();
  if (containsCoupangPartnersDisclosure(text)) {
    return text;
  }
  return `${text}\n\n${V055_COUPANG_PARTNERS_DISCLOSURE}`.trim();
}

export function containsCoupangPartnersDisclosure(value: string) {
  const compact = value.replace(/\s+/g, "");
  return compact.includes("쿠팡파트너스") &&
    compact.includes("수수료") &&
    compact.includes("제공받을수있습니다");
}
