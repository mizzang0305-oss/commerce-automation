import type {
  ProductCandidateLike,
  ProductSource,
  ProductSourceAdapter,
  ProductSourceAdapterDescriptor,
  ProductSourceAdapterInput,
  SafeProductUrlRef
} from "../productSourceAdapterTypes";

export function createStubProductSourceAdapter(source: ProductSource): ProductSourceAdapter {
  return {
    source,
    configured: false,
    describe: (): ProductSourceAdapterDescriptor => ({
      source,
      configured: false,
      apiCallsEnabled: false,
      secretsRequired: [],
      safeSummary: `${source} adapter is research-only and performs no API calls.`
    }),
    mapCandidate: (input: ProductSourceAdapterInput): ProductCandidateLike => ({
      source,
      sourceProductId: toSafeId(input.sourceProductId),
      title: input.title.trim() || "Unavailable product source",
      safeProductUrlRef: safeRef(source, input.sourceProductId),
      media: []
    }),
    listMedia: () => [],
    getProductUrlRef: (candidate: ProductCandidateLike): SafeProductUrlRef => ({ ...candidate.safeProductUrlRef })
  };
}

function safeRef(source: ProductSource, sourceProductId: string): SafeProductUrlRef {
  return {
    source,
    safeRef: `safe:${source}:product:${toSafeId(sourceProductId)}`
  };
}

function toSafeId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "unknown";
}
