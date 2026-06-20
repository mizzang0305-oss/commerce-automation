import type {
  ProductCandidateLike,
  ProductMediaLike,
  ProductSourceAdapter,
  ProductSourceAdapterDescriptor,
  ProductSourceAdapterInput,
  SafeProductUrlRef
} from "../productSourceAdapterTypes";

export function createCoupangProductSourceAdapter(): ProductSourceAdapter {
  return {
    source: "coupang",
    configured: true,
    describe: (): ProductSourceAdapterDescriptor => ({
      source: "coupang",
      configured: true,
      apiCallsEnabled: false,
      secretsRequired: [],
      safeSummary: "Maps existing local Coupang candidate data to safe refs; no network calls."
    }),
    mapCandidate: (input: ProductSourceAdapterInput): ProductCandidateLike => {
      const safeProductUrlRef = toSafeProductUrlRef(input.sourceProductId);
      return {
        source: "coupang",
        sourceProductId: input.sourceProductId,
        title: input.title.trim() || "Untitled Coupang product",
        safeProductUrlRef,
        media: toSafeMediaRefs(input)
      };
    },
    listMedia: (candidate: ProductCandidateLike) => [...candidate.media],
    getProductUrlRef: (candidate: ProductCandidateLike): SafeProductUrlRef => ({ ...candidate.safeProductUrlRef })
  };
}

function toSafeProductUrlRef(sourceProductId: string): SafeProductUrlRef {
  return {
    source: "coupang",
    safeRef: `safe:coupang:product:${toSafeId(sourceProductId)}`
  };
}

function toSafeMediaRefs(input: ProductSourceAdapterInput): ProductMediaLike[] {
  const mediaCount = input.rawMediaUrls?.length ?? 0;
  return Array.from({ length: mediaCount }, (_, index) => ({
    source: "coupang",
    mediaType: "image",
    safeRef: `safe:coupang:media:${toSafeId(input.sourceProductId)}:${index}`,
    alt: input.title.trim() || "Coupang product media"
  }));
}

function toSafeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "unknown";
}
