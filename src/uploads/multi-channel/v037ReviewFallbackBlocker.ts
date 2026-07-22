export type V037ReviewStatus = "PENDING_HUMAN_REVIEW" | "GENERATION_FAILED";

export type V037VisualProbe = {
  dominant_color_ratio?: number;
  rgb_stdev?: [number, number, number];
  colorbar_signature_present?: boolean;
  debug_test_pattern_marker_present?: boolean;
};

export type V037ReviewCandidate = {
  item_id: string;
  product_source_name: string;
  source_image_present: boolean;
  offer_text_present: boolean;
  price_or_spec_required?: boolean;
  price_or_spec_present?: boolean;
  renderer_name: string;
  template_id: string;
  output_path: string;
  missing_asset_path?: string | null;
  visual_probe?: V037VisualProbe;
};

export type V037GenerationFailedCard = {
  review_status: "GENERATION_FAILED";
  normal_review_item_allowed: false;
  safe_to_upload: false;
  item_id: string;
  product_source_name: string;
  failure_reason: string;
  missing_asset_path: string | null;
  renderer_name: string;
  template_id: string;
  output_path: string;
  next_action: string;
};

export type V037NormalReviewItem = {
  review_status: "PENDING_HUMAN_REVIEW";
  normal_review_item_allowed: true;
  safe_to_upload: false;
  item_id: string;
  product_source_name: string;
  renderer_name: string;
  template_id: string;
  output_path: string;
};

export type V037ReviewGateResult = V037GenerationFailedCard | V037NormalReviewItem;

export type V037ReviewFallbackSummary = {
  review_status: "GENERATION_FAILED" | "PENDING_HUMAN_REVIEW";
  safe_to_upload: false;
  failed_count: number;
  fallback_count: number;
  normal_review_count: number;
  failure_cards: V037GenerationFailedCard[];
  production_side_effect: "NO";
  upload_executed: false;
  external_publish_executed: false;
};

const FALLBACK_RENDERER_PATTERN = /(?:fallback|placeholder|test[-_ ]?pattern|debug|local_v037_scene_asset_renderer)/i;
const MIN_COMMERCE_VISUAL_STDEV = 2;
const SOLID_FRAME_RATIO = 0.98;

export function classifyV037ReviewCandidate(candidate: V037ReviewCandidate): V037ReviewGateResult {
  const failureReason = findFailureReason(candidate);
  if (failureReason) {
    return {
      review_status: "GENERATION_FAILED",
      normal_review_item_allowed: false,
      safe_to_upload: false,
      item_id: candidate.item_id,
      product_source_name: candidate.product_source_name,
      failure_reason: failureReason,
      missing_asset_path: candidate.missing_asset_path ?? null,
      renderer_name: candidate.renderer_name,
      template_id: candidate.template_id,
      output_path: candidate.output_path,
      next_action: buildNextAction(failureReason)
    };
  }

  return {
    review_status: "PENDING_HUMAN_REVIEW",
    normal_review_item_allowed: true,
    safe_to_upload: false,
    item_id: candidate.item_id,
    product_source_name: candidate.product_source_name,
    renderer_name: candidate.renderer_name,
    template_id: candidate.template_id,
    output_path: candidate.output_path
  };
}

export function buildV037ReviewFallbackSummary(candidates: V037ReviewCandidate[]): V037ReviewFallbackSummary {
  const results = candidates.map(classifyV037ReviewCandidate);
  const failureCards = results.filter(isFailureCard);

  return {
    review_status: failureCards.length > 0 ? "GENERATION_FAILED" : "PENDING_HUMAN_REVIEW",
    safe_to_upload: false,
    failed_count: failureCards.length,
    fallback_count: failureCards.filter((card) => isFallbackReason(card.failure_reason)).length,
    normal_review_count: results.length - failureCards.length,
    failure_cards: failureCards,
    production_side_effect: "NO",
    upload_executed: false,
    external_publish_executed: false
  };
}

export function renderV037ReviewFailureCardHtml(card: V037GenerationFailedCard): string {
  return [
    '<section class="generation-failed-card" data-review-status="GENERATION_FAILED">',
    "<h2>GENERATION_FAILED</h2>",
    `<p><strong>item id</strong>: ${escapeHtml(card.item_id)}</p>`,
    `<p><strong>product/source name</strong>: ${escapeHtml(card.product_source_name)}</p>`,
    `<p><strong>failure reason</strong>: ${escapeHtml(card.failure_reason)}</p>`,
    `<p><strong>missing asset path</strong>: ${escapeHtml(card.missing_asset_path ?? "NONE_RECORDED")}</p>`,
    `<p><strong>renderer name</strong>: ${escapeHtml(card.renderer_name)}</p>`,
    `<p><strong>template id</strong>: ${escapeHtml(card.template_id)}</p>`,
    `<p><strong>next action</strong>: ${escapeHtml(card.next_action)}</p>`,
    "<p>safe_to_upload=false</p>",
    "</section>"
  ].join("");
}

function findFailureReason(candidate: V037ReviewCandidate): string | null {
  if (!candidate.source_image_present) return "SOURCE_IMAGE_MISSING";
  if (!candidate.offer_text_present) return "OFFER_TEXT_MISSING";
  if (candidate.price_or_spec_required && !candidate.price_or_spec_present) {
    return "PRICE_OR_SPEC_MISSING";
  }
  if (candidate.missing_asset_path) return "REQUIRED_ASSET_MISSING";
  if (FALLBACK_RENDERER_PATTERN.test(candidate.renderer_name)) {
    return "FALLBACK_RENDERER_REGRESSION";
  }
  if (candidate.visual_probe?.debug_test_pattern_marker_present) {
    return "DEBUG_TEST_PATTERN_MARKER_PRESENT";
  }
  if (candidate.visual_probe?.colorbar_signature_present) {
    return "COLORBAR_PLACEHOLDER_SIGNATURE";
  }
  if (isLowInformationVisual(candidate.visual_probe)) {
    return "LOW_INFORMATION_PLACEHOLDER_IMAGE";
  }
  return null;
}

function isLowInformationVisual(visualProbe: V037VisualProbe | undefined): boolean {
  if (!visualProbe) return false;
  const stdev = visualProbe.rgb_stdev;
  const solidFrame = typeof visualProbe.dominant_color_ratio === "number" && visualProbe.dominant_color_ratio >= SOLID_FRAME_RATIO;
  const flatChannels = Array.isArray(stdev) && stdev.every((value) => value <= MIN_COMMERCE_VISUAL_STDEV);
  return solidFrame && flatChannels;
}

function isFailureCard(result: V037ReviewGateResult): result is V037GenerationFailedCard {
  return result.review_status === "GENERATION_FAILED";
}

function isFallbackReason(reason: string): boolean {
  return /FALLBACK|PLACEHOLDER|TEST_PATTERN|COLORBAR|LOW_INFORMATION/i.test(reason);
}

function buildNextAction(reason: string): string {
  if (reason === "SOURCE_IMAGE_MISSING" || reason === "REQUIRED_ASSET_MISSING") {
    return "Provide the missing source asset, regenerate locally, and rerun the review gate.";
  }
  if (reason === "OFFER_TEXT_MISSING" || reason === "PRICE_OR_SPEC_MISSING") {
    return "Repair commerce copy inputs, regenerate locally, and rerun the review gate.";
  }
  return "Regenerate with a real commerce renderer and verify product image, offer text, price/spec, and CTA before human review.";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
