import type {
  CoupangProductResearchShape,
  CreativeEvidence,
  YouTubeCreativeResearchContext,
} from "./types";

export function buildYouTubeCreativeResearchContext(
  evidence: readonly CreativeEvidence[],
  product: CoupangProductResearchShape,
): YouTubeCreativeResearchContext {
  const terms = new Set(
    [product.category, ...product.useCases, ...product.benefitTerms]
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
  const relevant = evidence.filter((item) =>
    item.topicTags.some((tag) => terms.has(tag.toLowerCase())),
  );
  const selected = relevant.length > 0 ? relevant : evidence;

  return {
    productId: product.productId,
    category: product.category,
    relevantHooks: [...new Set(selected.map((item) => item.hook.family))].sort(),
    relevantStructures: selected.map((item) => item.structure.map((section) => section.section)),
    ctaTimingSignals: [
      ...new Set(selected.flatMap((item) => (item.cta ? [item.cta.timing] : []))),
    ].sort(),
    topicSignals: [...new Set(selected.flatMap((item) => item.topicTags))].sort(),
    supportingVideoIds: [...new Set(selected.map((item) => item.videoId))].sort(),
    researchOnly: true,
    productionRankingMutationAllowed: false,
    rawMediaReuseAllowed: false,
  };
}
