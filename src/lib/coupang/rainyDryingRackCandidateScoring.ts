import type { ProductCandidate } from "@/types/automation";

export type RainyDryingRackCandidateScore = {
  candidateId: string;
  finalScore: number;
  seasonalFitScore: number;
  lossAversionScore: number;
  motionSuitabilityScore: number;
  affiliateReady: boolean;
  productImageReady: boolean;
  policyClear: boolean;
  duplicateUploadRisk: boolean;
  accepted: boolean;
  reason: string;
};

export type RainyDryingRackSelection = {
  candidate: ProductCandidate;
  score: RainyDryingRackCandidateScore;
};

type RainyDryingRackSelectionInput = {
  baselineCandidateId?: string;
  baselineProductNames?: string[];
  baselineProductKeys?: string[];
};

const DRYING_RACK_TERMS = [
  "\uBE68\uB798\uAC74\uC870\uB300",
  "\uAC74\uC870\uB300",
  "\uC2E4\uB0B4\uAC74\uC870\uB300",
  "dryingrack",
  "laundryrack",
  "clothesrack"
];

const RAINY_SEASON_TERMS = [
  "\uC7A5\uB9C8",
  "\uC2E4\uB0B4",
  "\uBE44",
  "\uC2B5\uAE30",
  "\uBE68\uB798",
  "\uC0DD\uD65C\uC6A9\uD488",
  "rainy",
  "indoor",
  "laundry"
];

const SPACE_SAVING_TERMS = [
  "\uC811\uC774\uC2DD",
  "\uD3F4\uB529",
  "\uC811\uB294",
  "\uACF5\uAC04\uC808\uC57D",
  "\uC18C\uD615",
  "\uC790\uCDE8",
  "fold",
  "space",
  "compact"
];

const MOTION_TERMS = [
  "\uC811\uC774\uC2DD",
  "\uC2E4\uB0B4",
  "\uC218\uAC74",
  "\uC591\uB9D0",
  "\uC154\uCE20",
  "fold",
  "indoor",
  "towel",
  "socks",
  "shirt"
];

const BLOCKED_POLICY_TERMS = [
  "\uC131\uC778",
  "19\uAE08",
  "\uC758\uC57D",
  "\uAC74\uAC15\uAE30\uB2A5",
  "\uC8FC\uB958",
  "\uB2F4\uBC30",
  "\uBB34\uAE30",
  "\uC704\uD5D8",
  "adult",
  "weapon",
  "alcohol",
  "tobacco"
];

export function scoreRainyDryingRackCandidate(
  candidate: ProductCandidate,
  input: RainyDryingRackSelectionInput = {}
): RainyDryingRackCandidateScore {
  const searchable = normalize([
    candidate.product_name,
    candidate.category,
    payloadString(candidate, "category_path"),
    payloadString(candidate, "source_keyword"),
    payloadString(candidate, "keyword"),
    payloadString(candidate, "search_keyword")
  ].join(" "));
  const affiliateReady = Boolean(candidate.selected_affiliate_url?.trim()) &&
    affiliateStatus(candidate) !== "invalid";
  const productImageReady = Boolean(productImageRef(candidate)) &&
    imageStatus(candidate) !== "invalid_image_url" &&
    imageStatus(candidate) !== "missing_image";
  const duplicateUploadRisk = isBaselineCandidate(candidate, input) ||
    Boolean(candidate.duplicate_status && candidate.duplicate_status !== "unique");
  const policyClear = !includesAny(searchable, BLOCKED_POLICY_TERMS);
  const isDryingRack = includesAny(searchable, DRYING_RACK_TERMS);
  const isRainySeasonUse = includesAny(searchable, RAINY_SEASON_TERMS);
  const isSpaceSaving = includesAny(searchable, SPACE_SAVING_TERMS);

  const seasonalFitScore = clampScore(
    48 +
    (isDryingRack ? 32 : 0) +
    (isRainySeasonUse ? 16 : 0) +
    (productImageReady ? 4 : 0)
  );
  const lossAversionScore = clampScore(
    56 +
    (isDryingRack ? 16 : 0) +
    (isRainySeasonUse ? 10 : 0) +
    (isSpaceSaving ? 8 : 0) +
    (affiliateReady && productImageReady ? 4 : 0)
  );
  const motionSuitabilityScore = clampScore(
    48 +
    (isDryingRack ? 16 : 0) +
    (isSpaceSaving ? 10 : 0) +
    (includesAny(searchable, MOTION_TERMS) ? 8 : 0) +
    (productImageReady ? 4 : 0)
  );
  const baseScore = Math.max(0, Math.min(100, Math.round(Number(candidate.candidate_score ?? 0))));
  const finalScore = clampScore(Math.round(
    seasonalFitScore * 0.3 +
    lossAversionScore * 0.3 +
    motionSuitabilityScore * 0.2 +
    (affiliateReady ? 10 : 0) +
    (productImageReady ? 8 : 0) +
    Math.min(7, Math.round(baseScore / 15)) -
    (duplicateUploadRisk ? 40 : 0) -
    (policyClear ? 0 : 50)
  ));
  const accepted = finalScore >= 80 &&
    seasonalFitScore >= 80 &&
    lossAversionScore >= 85 &&
    motionSuitabilityScore >= 75 &&
    affiliateReady &&
    productImageReady &&
    policyClear &&
    !duplicateUploadRisk;

  return {
    candidateId: candidate.id,
    finalScore,
    seasonalFitScore,
    lossAversionScore,
    motionSuitabilityScore,
    affiliateReady,
    productImageReady,
    policyClear,
    duplicateUploadRisk,
    accepted,
    reason: accepted
      ? "rainy season drying-rack fit: indoor laundry pain, space-saving foldable use, affiliate and product image ready"
      : "rainy season drying-rack score gate not met"
  };
}

export function selectRainyDryingRackCandidate(
  candidates: ProductCandidate[],
  input: RainyDryingRackSelectionInput = {}
): RainyDryingRackSelection | null {
  return candidates
    .map((candidate) => ({
      candidate,
      score: scoreRainyDryingRackCandidate(candidate, input)
    }))
    .filter((entry) => entry.score.accepted)
    .sort((left, right) =>
      right.score.finalScore - left.score.finalScore ||
      right.score.lossAversionScore - left.score.lossAversionScore ||
      left.candidate.id.localeCompare(right.candidate.id)
    )[0] ?? null;
}

export function getRainyDryingRackProductImageRef(candidate: ProductCandidate) {
  return productImageRef(candidate);
}

function isBaselineCandidate(
  candidate: ProductCandidate,
  input: RainyDryingRackSelectionInput
) {
  if (input.baselineCandidateId && candidate.id === input.baselineCandidateId) {
    return true;
  }
  if (candidate.product_key && input.baselineProductKeys?.includes(candidate.product_key)) {
    return true;
  }
  const productName = normalize(candidate.product_name);
  return Boolean(productName && input.baselineProductNames?.map(normalize).includes(productName));
}

function productImageRef(candidate: ProductCandidate) {
  return payloadString(candidate, "local_product_image_path") ||
    payloadString(candidate, "thumbnail_url") ||
    payloadString(candidate, "image_url") ||
    payloadString(candidate, "product_image_url") ||
    payloadString(candidate, "productImage") ||
    payloadString(candidate, "productImageUrl");
}

function affiliateStatus(candidate: ProductCandidate) {
  return payloadString(candidate, "affiliate_validation_status");
}

function imageStatus(candidate: ProductCandidate) {
  return payloadString(candidate, "image_readiness_status");
}

function payloadString(candidate: ProductCandidate, key: string) {
  const value = candidate.payload?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(normalize(term)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").normalize("NFKC");
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}
