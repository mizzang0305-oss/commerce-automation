import type { CommerceMarketplace, CommerceProductCandidate } from "./commerceProductRouter";

export type AffiliateProvider =
  | "coupang"
  | "naver_shopping"
  | "aliexpress"
  | "amazon"
  | "linkprice"
  | "adpick"
  | "tenping";

export type AffiliateProviderRoutingResult = {
  selected_provider: AffiliateProvider;
  provider_active: boolean;
  live_call_allowed: boolean;
  provider_reason: string[];
  safety_notes: string[];
  blocker?: string;
};

export const ACTIVE_AFFILIATE_PROVIDER: AffiliateProvider = "coupang";

export const INACTIVE_PROVIDER_ADAPTERS: AffiliateProvider[] = [
  "naver_shopping",
  "aliexpress",
  "amazon",
  "linkprice",
  "adpick",
  "tenping"
];

export function routeAffiliateProvider(candidate: CommerceProductCandidate): AffiliateProviderRoutingResult {
  const selected = providerForMarketplace(candidate.marketplace);
  const providerActive = selected === ACTIVE_AFFILIATE_PROVIDER;
  const safetyNotes = buildSafetyNotes(candidate, selected);
  const blocker = providerActive ? "V036_PROVIDER_PREVIEW_ONLY_NO_LIVE_CALL" : `${selected.toUpperCase()}_ADAPTER_INACTIVE`;

  return {
    selected_provider: selected,
    provider_active: providerActive,
    live_call_allowed: false,
    provider_reason: [
      providerActive
        ? "Coupang is the only active provider in v036, but this router emits preview plans only."
        : `${selected} is modeled as an inactive adapter for future PRs.`,
      candidate.affiliate_url_present ? "Affiliate URL is present for sanitized comment preview." : "Affiliate URL is missing."
    ],
    safety_notes: safetyNotes,
    blocker
  };
}

export function providerForMarketplace(marketplace: CommerceMarketplace): AffiliateProvider {
  if (marketplace === "naver") return "naver_shopping";
  if (marketplace === "aliexpress") return "aliexpress";
  if (marketplace === "amazon") return "amazon";
  if (marketplace === "linkprice" || marketplace === "adpick" || marketplace === "tenping") return marketplace;
  return "coupang";
}

function buildSafetyNotes(candidate: CommerceProductCandidate, provider: AffiliateProvider) {
  const notes = [
    "Raw affiliate URLs must stay out of logs and preview reports.",
    "Comment CTA requires product link plus affiliate disclosure."
  ];
  if (provider === "aliexpress") {
    notes.push("AliExpress low-price goods need extra electrical, food, and child-safety risk checks.");
  }
  if (["linkprice", "adpick", "tenping"].includes(provider)) {
    notes.push("CPA/CPS campaign copy must block exaggerated claims.");
  }
  if (candidate.risk_tags.length) {
    notes.push("Risk tags require manual owner review before any upload.");
  }
  return notes;
}
