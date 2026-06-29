import { CHANNEL_KEYS, type ChannelKey, getChannelProfile } from "./channelProfiles";

export type CommerceMarketplace =
  | "coupang"
  | "naver"
  | "aliexpress"
  | "amazon"
  | "linkprice"
  | "adpick"
  | "tenping"
  | "unknown";

export type CommerceProductCandidate = {
  candidate_id: string;
  product_name: string;
  category?: string;
  price?: number;
  marketplace: CommerceMarketplace;
  product_url_present: boolean;
  affiliate_url_present: boolean;
  product_image_present: boolean;
  tags: string[];
  seasonal_tags: string[];
  risk_tags: string[];
};

export type ChannelRoutingResult = {
  candidate_id: string;
  selected_channel_key: ChannelKey;
  channel_fit_score: number;
  marketplace_fit_score: number;
  hook_strength_score: number;
  conversion_intent_score: number;
  safety_risk_score: number;
  selected_reason: string[];
  rejected_channels: Array<{
    channel_key: ChannelKey;
    reason: string[];
  }>;
};

type ChannelScoring = {
  channel_key: ChannelKey;
  channel_fit_score: number;
  hook_strength_score: number;
  reason: string[];
};

const CHANNEL_TERMS: Record<ChannelKey, string[]> = {
  father_jobs: [
    "car",
    "vehicle",
    "tool",
    "driver",
    "garage",
    "office",
    "work",
    "camping",
    "protection",
    "organizer",
    "\uCC28\uB7C9",
    "\uACF5\uAD6C",
    "\uB4DC\uB77C\uC774\uBC84",
    "\uC815\uB9AC",
    "\uBCF4\uD638",
    "\uC0AC\uBB34",
    "\uC190\uBAA9"
  ],
  neoman_moleulgeol: [
    "laundry",
    "drying",
    "rack",
    "cleaning",
    "storage",
    "kitchen",
    "bathroom",
    "humidity",
    "rainy",
    "seasonal",
    "\uBE68\uB798",
    "\uAC74\uC870",
    "\uAC74\uC870\uB300",
    "\uCCAD\uC18C",
    "\uC218\uB0A9",
    "\uC8FC\uBC29",
    "\uD654\uC7A5\uC2E4",
    "\uC7A5\uB9C8",
    "\uD638\uBE75"
  ],
  lets_buy: [
    "deal",
    "sale",
    "value",
    "compare",
    "price",
    "cheap",
    "cable",
    "mini fan",
    "electronics",
    "\uB300\uAC00",
    "\uAC00\uC131\uBE44",
    "\uD2B9\uAC00",
    "\uC138\uC77C",
    "\uBE44\uAD50",
    "\uCF00\uC774\uBE14",
    "\uC120\uD48D\uAE30",
    "\uC804\uC790"
  ]
};

const UNSAFE_TERMS = [
  "medical",
  "medicine",
  "health cure",
  "child safety",
  "weapon",
  "alcohol",
  "tobacco",
  "\uC758\uC57D",
  "\uAC74\uAC15\uAE30\uB2A5",
  "\uBB34\uAE30",
  "\uC8FC\uB958",
  "\uB2F4\uBC30",
  "\uC720\uC544"
];

const GUARANTEED_CLAIM_TERMS = [
  "guaranteed",
  "100%",
  "cure",
  "\uBCF4\uC7A5",
  "\uBB34\uC870\uAC74",
  "\uC644\uC804",
  "\uD6A8\uACFC"
];

export function routeCommerceProduct(candidate: CommerceProductCandidate): ChannelRoutingResult {
  const safetyRisk = calculateSafetyRiskScore(candidate);
  const marketplaceFitScore = calculateMarketplaceFitScore(candidate);
  const conversionIntentScore = calculateConversionIntentScore(candidate);
  const scorings = CHANNEL_KEYS
    .map((channelKey) => scoreChannel(candidate, channelKey))
    .sort((left, right) =>
      weightedChannelScore(right, marketplaceFitScore, conversionIntentScore, safetyRisk) -
      weightedChannelScore(left, marketplaceFitScore, conversionIntentScore, safetyRisk)
    );
  const selected = scorings[0];

  return {
    candidate_id: candidate.candidate_id,
    selected_channel_key: selected.channel_key,
    channel_fit_score: selected.channel_fit_score,
    marketplace_fit_score: marketplaceFitScore,
    hook_strength_score: selected.hook_strength_score,
    conversion_intent_score: conversionIntentScore,
    safety_risk_score: safetyRisk,
    selected_reason: selected.reason,
    rejected_channels: scorings.slice(1).map((scoring) => ({
      channel_key: scoring.channel_key,
      reason: buildRejectedReason(scoring, selected)
    }))
  };
}

export function routeCommerceProducts(candidates: CommerceProductCandidate[]): ChannelRoutingResult[] {
  return candidates.map(routeCommerceProduct);
}

export function calculateSafetyRiskScore(candidate: CommerceProductCandidate) {
  const text = searchableText(candidate);
  const unsafeHits = countHits(text, UNSAFE_TERMS);
  const claimHits = countHits(text, GUARANTEED_CLAIM_TERMS);
  const riskTagPenalty = candidate.risk_tags.length * 12;
  return clamp(unsafeHits * 35 + claimHits * 20 + riskTagPenalty);
}

export function hasUnsafeProductCategory(candidate: CommerceProductCandidate) {
  return calculateSafetyRiskScore(candidate) >= 50;
}

function scoreChannel(candidate: CommerceProductCandidate, channelKey: ChannelKey): ChannelScoring {
  const profile = getChannelProfile(channelKey);
  const text = searchableText(candidate);
  const hits = countHits(text, CHANNEL_TERMS[channelKey]);
  const avoidHits = countHits(text, profile.avoid_categories);
  const imageBonus = candidate.product_image_present ? 8 : 0;
  const affiliateBonus = candidate.affiliate_url_present ? 6 : 0;
  const base = 44 + hits * 13 + imageBonus + affiliateBonus - avoidHits * 14;
  const channelFit = clamp(base);
  const hookStrength = clamp(50 + hits * 11 + (candidate.seasonal_tags.length ? 8 : 0) - candidate.risk_tags.length * 8);
  const reason = [
    `${profile.display_name} matched ${hits} product/context term${hits === 1 ? "" : "s"}.`,
    candidate.product_image_present ? "Product image is ready for channel-specific scene planning." : "Product image is missing.",
    candidate.affiliate_url_present ? "Affiliate link is available for comment CTA planning." : "Affiliate link is missing."
  ];
  if (avoidHits) {
    reason.push(`${avoidHits} avoid-category signal${avoidHits === 1 ? "" : "s"} reduced fit.`);
  }
  return {
    channel_key: channelKey,
    channel_fit_score: channelFit,
    hook_strength_score: hookStrength,
    reason
  };
}

function calculateMarketplaceFitScore(candidate: CommerceProductCandidate) {
  if (candidate.marketplace === "coupang") return 92;
  if (candidate.marketplace === "naver") return 76;
  if (candidate.marketplace === "aliexpress") return hasUnsafeProductCategory(candidate) ? 35 : 68;
  if (candidate.marketplace === "amazon") return 64;
  if (["linkprice", "adpick", "tenping"].includes(candidate.marketplace)) return 58;
  return 44;
}

function calculateConversionIntentScore(candidate: CommerceProductCandidate) {
  return clamp(
    36 +
    (candidate.product_url_present ? 18 : 0) +
    (candidate.affiliate_url_present ? 24 : 0) +
    (candidate.product_image_present ? 12 : 0) +
    (candidate.price && candidate.price > 0 ? 6 : 0)
  );
}

function weightedChannelScore(
  scoring: ChannelScoring,
  marketplaceFitScore: number,
  conversionIntentScore: number,
  safetyRiskScore: number
) {
  return scoring.channel_fit_score * 0.45 +
    scoring.hook_strength_score * 0.2 +
    marketplaceFitScore * 0.15 +
    conversionIntentScore * 0.15 -
    safetyRiskScore * 0.35;
}

function buildRejectedReason(scoring: ChannelScoring, selected: ChannelScoring) {
  const reason = [`Lower weighted fit than ${selected.channel_key}.`];
  if (scoring.channel_fit_score < selected.channel_fit_score) {
    reason.push("Fewer product/category signals matched this channel.");
  }
  if (scoring.hook_strength_score < selected.hook_strength_score) {
    reason.push("Opening hook potential was weaker for this channel.");
  }
  return reason;
}

function searchableText(candidate: CommerceProductCandidate) {
  return normalize([
    candidate.product_name,
    candidate.category,
    ...candidate.tags,
    ...candidate.seasonal_tags,
    ...candidate.risk_tags
  ].filter(Boolean).join(" "));
}

function countHits(searchable: string, terms: string[]) {
  return terms.filter((term) => searchable.includes(normalize(term))).length;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").normalize("NFKC");
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
