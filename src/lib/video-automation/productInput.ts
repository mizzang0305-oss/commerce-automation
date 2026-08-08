import type { ProductVideoAutomationInput } from "./types";

const KEY_PATTERN = /^[a-z0-9][a-z0-9_:-]{2,120}$/u;

export function validateProductVideoInput(value: ProductVideoAutomationInput): ProductVideoAutomationInput {
  if (!value.runId.trim()) throw new Error("VIDEO_AUTOMATION_RUN_ID_REQUIRED");
  if (value.mode !== "local_review_only") throw new Error("VIDEO_AUTOMATION_LOCAL_REVIEW_ONLY");
  if (value.creative.candidateCount !== 3) throw new Error("VIDEO_AUTOMATION_EXACTLY_THREE_CANDIDATES_REQUIRED");
  if (value.creative.language !== "ko") throw new Error("VIDEO_AUTOMATION_KOREAN_ONLY");
  if (!KEY_PATTERN.test(value.product.productKey)) throw new Error("VIDEO_AUTOMATION_PRODUCT_KEY_INVALID");
  if (!value.product.canonicalProductName.trim()) throw new Error("VIDEO_AUTOMATION_CANONICAL_NAME_REQUIRED");
  if (value.product.aliases.length === 0) throw new Error("VIDEO_AUTOMATION_ALIASES_REQUIRED");
  if (value.product.anchors.length < 3) throw new Error("VIDEO_AUTOMATION_PRODUCT_ANCHORS_REQUIRED");
  if (value.product.imagePaths.length < 5) throw new Error("VIDEO_AUTOMATION_SCENE_IMAGES_REQUIRED");
  if (value.product.affiliateUrl && !value.product.disclosureText?.trim()) throw new Error("VIDEO_AUTOMATION_DISCLOSURE_REQUIRED");
  if (value.product.exactProductReference) {
    if (value.product.exactProductReference.identityType !== "product_reference") throw new Error("VIDEO_AUTOMATION_EXACT_REFERENCE_ROLE_INVALID");
    if (!value.product.exactProductReference.localPath.trim()) throw new Error("VIDEO_AUTOMATION_EXACT_REFERENCE_PATH_REQUIRED");
    if (!value.product.sourceProvenance || value.product.sourceProvenance.productKey !== value.product.productKey) throw new Error("VIDEO_AUTOMATION_SOURCE_PROVENANCE_REQUIRED");
  }
  return value;
}
