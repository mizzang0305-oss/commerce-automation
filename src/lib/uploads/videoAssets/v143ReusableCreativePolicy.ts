export type V143UsageSourceRole =
  | "exact_product_use"
  | "generic_usage_example"
  | "product_reference_still";

export type V143CreativePolicyBlocker =
  | "V143_HOOK_READABILITY_REQUIRED"
  | "V143_REAL_USAGE_SCENE_REQUIRED"
  | "V143_USAGE_SOURCE_ROLE_REQUIRED"
  | "V143_USAGE_LABEL_REQUIRED"
  | "V143_EXACT_PRODUCT_IDENTITY_VERIFICATION_REQUIRED"
  | "V143_GENERIC_USAGE_EXACT_PRODUCT_OVERCLAIM"
  | "V143_NATIONALITY_CLAIM_UNVERIFIED"
  | "V143_PRODUCT_IDENTITY_BINDING_REQUIRED"
  | "V143_APPROVED_KOREAN_MERCHANT_TTS_REQUIRED"
  | "V143_MERCHANT_TTS_SPEED_OUT_OF_RANGE"
  | "V143_UPLOAD_DEFAULT_MUST_REMAIN_BLOCKED";

export type V143CreativePolicyEvidence = {
  hook_font_px: number;
  hook_max_lines: number;
  hook_visible_within_seconds: number;
  hook_high_contrast: boolean;
  real_usage_scene_present: boolean;
  usage_source_role?: V143UsageSourceRole | null;
  usage_label_present: boolean;
  exact_product_identity_claim: boolean;
  exact_product_identity_verified: boolean;
  actor_nationality_claim?: string | null;
  actor_nationality_verified: boolean;
  product_identity_binding_verified: boolean;
  tts_provider_approved: boolean;
  tts_language: string;
  tts_speed_multiplier: number;
  tts_delivery_style: string;
  safe_to_upload: boolean;
  safe_to_public_upload: boolean;
};

export type V143CreativePolicyResult = {
  version: "v143";
  passed: boolean;
  blockers: V143CreativePolicyBlocker[];
  usage_source_role: V143UsageSourceRole | null;
  exact_product_use_claim_allowed: boolean;
  nationality_claim_allowed: boolean;
  merchant_tts_pass: boolean;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

const MIN_HOOK_FONT_PX = 100;
const MAX_HOOK_LINES = 2;
const MAX_HOOK_VISIBLE_SECONDS = 1;
const MIN_MERCHANT_TTS_SPEED = 1.2;
const MAX_MERCHANT_TTS_SPEED = 1.3;
const REQUIRED_TTS_DELIVERY = "brisk_confident_sales";

export function evaluateV143ReusableCreativePolicy(
  evidence: V143CreativePolicyEvidence
): V143CreativePolicyResult {
  const blockers: V143CreativePolicyBlocker[] = [];
  const usageSourceRole = evidence.usage_source_role ?? null;
  const nationalityClaim = evidence.actor_nationality_claim?.trim() ?? "";
  const hookReadable =
    finiteAtLeast(evidence.hook_font_px, MIN_HOOK_FONT_PX) &&
    finiteBetween(evidence.hook_max_lines, 1, MAX_HOOK_LINES) &&
    finiteBetween(evidence.hook_visible_within_seconds, 0, MAX_HOOK_VISIBLE_SECONDS) &&
    evidence.hook_high_contrast;

  if (!hookReadable) blockers.push("V143_HOOK_READABILITY_REQUIRED");
  if (!evidence.real_usage_scene_present) blockers.push("V143_REAL_USAGE_SCENE_REQUIRED");
  if (!usageSourceRole) blockers.push("V143_USAGE_SOURCE_ROLE_REQUIRED");
  if (evidence.real_usage_scene_present && !evidence.usage_label_present) {
    blockers.push("V143_USAGE_LABEL_REQUIRED");
  }

  const exactProductUseRole = usageSourceRole === "exact_product_use";
  const exactProductUseClaimAllowed =
    exactProductUseRole &&
    evidence.exact_product_identity_claim &&
    evidence.exact_product_identity_verified;
  if (exactProductUseRole && !evidence.exact_product_identity_verified) {
    blockers.push("V143_EXACT_PRODUCT_IDENTITY_VERIFICATION_REQUIRED");
  }
  if (
    usageSourceRole === "generic_usage_example" &&
    evidence.exact_product_identity_claim
  ) {
    blockers.push("V143_GENERIC_USAGE_EXACT_PRODUCT_OVERCLAIM");
  }

  const nationalityClaimAllowed = !nationalityClaim || evidence.actor_nationality_verified;
  if (!nationalityClaimAllowed) blockers.push("V143_NATIONALITY_CLAIM_UNVERIFIED");
  if (!evidence.product_identity_binding_verified) {
    blockers.push("V143_PRODUCT_IDENTITY_BINDING_REQUIRED");
  }

  const approvedKoreanMerchantTts =
    evidence.tts_provider_approved &&
    evidence.tts_language.trim().toLowerCase().startsWith("ko") &&
    evidence.tts_delivery_style.trim() === REQUIRED_TTS_DELIVERY;
  if (!approvedKoreanMerchantTts) {
    blockers.push("V143_APPROVED_KOREAN_MERCHANT_TTS_REQUIRED");
  }
  const merchantTtsSpeedPass = finiteBetween(
    evidence.tts_speed_multiplier,
    MIN_MERCHANT_TTS_SPEED,
    MAX_MERCHANT_TTS_SPEED
  );
  if (!merchantTtsSpeedPass) blockers.push("V143_MERCHANT_TTS_SPEED_OUT_OF_RANGE");

  if (evidence.safe_to_upload || evidence.safe_to_public_upload) {
    blockers.push("V143_UPLOAD_DEFAULT_MUST_REMAIN_BLOCKED");
  }

  return {
    version: "v143",
    passed: blockers.length === 0,
    blockers,
    usage_source_role: usageSourceRole,
    exact_product_use_claim_allowed: exactProductUseClaimAllowed,
    nationality_claim_allowed: nationalityClaimAllowed,
    merchant_tts_pass: approvedKoreanMerchantTts && merchantTtsSpeedPass,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function finiteAtLeast(value: number, minimum: number): boolean {
  return Number.isFinite(value) && value >= minimum;
}

function finiteBetween(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}
