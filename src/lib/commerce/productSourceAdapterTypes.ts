export type ProductSource =
  | "coupang"
  | "shopify"
  | "amazon_creators"
  | "medusa"
  | "spree"
  | "saleor"
  | "woocommerce";

export type ProductMediaLike = {
  source: ProductSource;
  mediaType: "image" | "video";
  safeRef: string;
  alt?: string;
};

export type SafeProductUrlRef = {
  source: ProductSource;
  safeRef: string;
};

export type ProductCandidateLike = {
  source: ProductSource;
  sourceProductId: string;
  title: string;
  safeProductUrlRef: SafeProductUrlRef;
  media: ProductMediaLike[];
};

export type ProductSourceAdapterInput = {
  source: ProductSource;
  sourceProductId: string;
  title: string;
  rawProductUrl?: string;
  rawMediaUrls?: string[];
  metadata?: unknown;
};

export type ProductSourceAdapterDescriptor = {
  source: ProductSource;
  configured: boolean;
  apiCallsEnabled: boolean;
  secretsRequired: string[];
  safeSummary: string;
};

export type ProductSourceAdapter = {
  source: ProductSource;
  configured: boolean;
  describe(): ProductSourceAdapterDescriptor;
  mapCandidate(input: ProductSourceAdapterInput): ProductCandidateLike;
  listMedia(candidate: ProductCandidateLike): ProductMediaLike[];
  getProductUrlRef(candidate: ProductCandidateLike): SafeProductUrlRef;
};
