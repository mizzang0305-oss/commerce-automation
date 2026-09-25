import { createHash, createPrivateKey, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { productVisualReviewPayload, type ProductVisualReviewReceipt } from "./productVisualReview";

type Attestation = { status: "passed" | "unverified"; evidencePath: string; reviewerId: string; reviewedAt: string };
type BoundFile = { path: string; sha256: string };

/** Human-authored input. The signer checks evidence bytes, but cannot replace a human rights or content judgment. */
export type ProductVisualSigningManifest = {
  schema: "product-visual-signing-manifest/v1";
  productId: string;
  canonicalProductName: string;
  affiliateProductId: string;
  affiliateUrl: string;
  files: {
    video: BoundFile;
    audio: BoundFile;
    narration: BoundFile;
    script: BoundFile;
    captions: BoundFile;
    sourceImages: Array<BoundFile & {
      productId: string;
      rightsStatus: "verified" | "unverified";
      rightsEvidenceId: string;
      rightsEvidencePath: string;
      policyReference: string;
    }>;
  };
  review: {
    productIdentity: Attestation;
    affiliateIdentity: Attestation;
    fullHumanContent: Attestation;
    exactSpokenName: Attestation;
    rights: Attestation;
    crossVideo: Attestation;
    priorPublicationSimilarityResult: "distinct" | "unknown";
    reviewedPriorVideoIds: string[];
    priorPublicationSources: Array<{ youtubeVideoId: string; productId: string; sourceSha256: string[] }>;
    reviewerId: string;
    reviewerVersion: string;
    evidenceId: string;
  };
};

const SHA256 = /^[a-f0-9]{64}$/u;
const PRODUCT_ID = /^coupang:product:\d+:item:\d+:vendor:\d+$/u;
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;

export class SigningGateError extends Error {
  constructor(readonly safeCode: string) {
    super(safeCode);
  }
}

function requireGate(condition: unknown, code: string): asserts condition {
  if (!condition) throw new SigningGateError(code);
}

async function verifyBoundFile(file: BoundFile, code: string): Promise<void> {
  requireGate(typeof file?.path === "string" && file.path.length > 0 && SHA256.test(file.sha256), code);
  let bytes: Buffer;
  try { bytes = await readFile(file.path); } catch { throw new SigningGateError(code); }
  requireGate(createHash("sha256").update(bytes).digest("hex") === file.sha256, code);
}

async function verifyEvidenceFile(path: string, code: string): Promise<void> {
  requireGate(typeof path === "string" && path.length > 0, code);
  try { requireGate((await readFile(path)).length > 0, code); } catch { throw new SigningGateError(code); }
}

/** Never called by producer or publisher. No automatic review decisions are generated here. */
export async function signProductVisualReview(input: {
  manifest: ProductVisualSigningManifest;
  currentPriorPublications: Array<{ youtubeVideoId: string; productId: string }>;
  privateKeyPem: string;
}): Promise<ProductVisualReviewReceipt> {
  const { manifest: m } = input;
  const currentPriorVideoIds = input.currentPriorPublications.map((entry) => entry.youtubeVideoId);
  requireGate(m?.schema === "product-visual-signing-manifest/v1", "REVIEW_MANIFEST_INVALID");
  requireGate(PRODUCT_ID.test(m.productId) && m.affiliateProductId === m.productId && m.canonicalProductName?.trim() && /^https:\/\//u.test(m.affiliateUrl), "PRODUCT_IDENTITY_INVALID");
  requireGate(m.files?.video && m.files.audio && m.files.narration && m.files.script && m.files.captions && Array.isArray(m.files.sourceImages) && m.files.sourceImages.length > 0, "REVIEW_FILES_MISSING");
  requireGate(m.review?.reviewerId?.trim() && m.review.reviewerVersion?.trim() && m.review.evidenceId?.trim(), "REVIEWER_IDENTITY_MISSING");
  requireGate(m.review.priorPublicationSimilarityResult === "distinct", "PRIOR_PUBLICATION_SIMILARITY_UNVERIFIED");
  requireGate(Array.isArray(input.currentPriorPublications) && input.currentPriorPublications.every((entry) => VIDEO_ID.test(entry.youtubeVideoId) && PRODUCT_ID.test(entry.productId)) &&
    new Set(currentPriorVideoIds).size === currentPriorVideoIds.length, "PRIOR_PUBLICATION_LEDGER_INVALID");
  requireGate(Array.isArray(m.review.reviewedPriorVideoIds) && m.review.reviewedPriorVideoIds.length === currentPriorVideoIds.length &&
    new Set(m.review.reviewedPriorVideoIds).size === currentPriorVideoIds.length &&
    currentPriorVideoIds.every((id) => m.review.reviewedPriorVideoIds.includes(id)), "PRIOR_PUBLICATION_REVIEW_STALE");
  requireGate(Array.isArray(m.review.priorPublicationSources) && m.review.priorPublicationSources.length === currentPriorVideoIds.length &&
    new Set(m.review.priorPublicationSources.map((entry) => entry.youtubeVideoId)).size === currentPriorVideoIds.length &&
    m.review.priorPublicationSources.every((entry) => input.currentPriorPublications.some((current) => current.youtubeVideoId === entry.youtubeVideoId && current.productId === entry.productId) &&
      Array.isArray(entry.sourceSha256) && entry.sourceSha256.length > 0 && entry.sourceSha256.every((hash) => SHA256.test(hash))), "PRIOR_PUBLICATION_SOURCE_EVIDENCE_MISSING");

  for (const [name, attestation] of Object.entries({
    productIdentity: m.review.productIdentity,
    affiliateIdentity: m.review.affiliateIdentity,
    fullHumanContent: m.review.fullHumanContent,
    exactSpokenName: m.review.exactSpokenName,
    rights: m.review.rights,
    crossVideo: m.review.crossVideo
  })) {
    requireGate(attestation?.status === "passed" && attestation.reviewerId === m.review.reviewerId &&
      typeof attestation.reviewedAt === "string" && Number.isFinite(Date.parse(attestation.reviewedAt)), `${name.toUpperCase()}_REVIEW_MISSING`);
    await verifyEvidenceFile(attestation.evidencePath, `${name.toUpperCase()}_EVIDENCE_MISSING`);
  }

  await verifyBoundFile(m.files.video, "VIDEO_HASH_MISMATCH");
  await verifyBoundFile(m.files.audio, "AUDIO_HASH_MISMATCH");
  await verifyBoundFile(m.files.narration, "NARRATION_HASH_MISMATCH");
  await verifyBoundFile(m.files.script, "SCRIPT_HASH_MISMATCH");
  await verifyBoundFile(m.files.captions, "CAPTION_HASH_MISMATCH");
  let captionTimeline: { schema?: unknown; audioSha256?: unknown; canonicalProductName?: unknown; cues?: Array<{ text?: unknown }> };
  try { captionTimeline = JSON.parse(await readFile(m.files.captions.path, "utf8")); }
  catch { throw new SigningGateError("CAPTION_TIMELINE_INVALID"); }
  requireGate(captionTimeline?.schema === "fresh-caption-timeline/v1" && Array.isArray(captionTimeline.cues) && captionTimeline.cues.length > 0, "CAPTION_TIMELINE_INVALID");
  requireGate(captionTimeline.audioSha256 === m.files.audio.sha256, "CAPTION_AUDIO_BINDING_MISMATCH");
  const compact = (value: string): string => value.toLocaleLowerCase("ko").replace(/[^가-힣a-z0-9]/gu, "");
  const visibleText = captionTimeline.cues.map((cue) => cue.text).filter((text): text is string => typeof text === "string").join(" ");
  requireGate(captionTimeline.canonicalProductName === m.canonicalProductName && compact(visibleText).includes(compact(m.canonicalProductName)), "CAPTION_CANONICAL_NAME_MISMATCH");
  const imageHashes = new Set<string>();
  for (const image of m.files.sourceImages) {
    requireGate(image.productId === m.productId, "SOURCE_PRODUCT_MISMATCH");
    requireGate(image.rightsStatus === "verified" && image.rightsEvidenceId?.trim() && image.policyReference?.trim(), "SOURCE_RIGHTS_UNVERIFIED");
    await verifyEvidenceFile(image.rightsEvidencePath, "SOURCE_RIGHTS_EVIDENCE_MISSING");
    await verifyBoundFile(image, "SOURCE_IMAGE_HASH_MISMATCH");
    requireGate(!imageHashes.has(image.sha256), "SOURCE_IMAGE_DUPLICATED");
    imageHashes.add(image.sha256);
  }
  for (const prior of m.review.priorPublicationSources) {
    requireGate(prior.productId !== m.productId, "PRODUCT_ALREADY_PUBLISHED");
    requireGate(prior.sourceSha256.every((hash) => !imageHashes.has(hash)), "CROSS_PRODUCT_BODY_SOURCE_REUSED");
  }

  let key;
  try { key = createPrivateKey(input.privateKeyPem); } catch { throw new SigningGateError("REVIEW_SIGNING_KEY_INVALID"); }
  requireGate(key.asymmetricKeyType === "ed25519", "REVIEW_SIGNING_KEY_INVALID");
  const receipt: ProductVisualReviewReceipt = {
    schema: "product-visual-review/v1", visualMode: "product_information",
    productId: m.productId, canonicalProductName: m.canonicalProductName,
    affiliateProductId: m.affiliateProductId,
    affiliateUrlSha256: createHash("sha256").update(m.affiliateUrl).digest("hex"),
    videoSha256: m.files.video.sha256,
    sourceSha256: m.files.sourceImages.map((image) => image.sha256),
    audioSha256: m.files.audio.sha256, narrationSha256: m.files.narration.sha256,
    scriptSha256: m.files.script.sha256,
    captionSha256: m.files.captions.sha256,
    rightsEvidenceId: m.files.sourceImages.map((image) => image.rightsEvidenceId).join(","),
    rightsReview: "passed", productContentReview: "passed", audioScriptReview: "passed", crossVideoReview: "passed",
    priorPublicationSimilarityResult: "distinct", reviewedPriorVideoIds: [...m.review.reviewedPriorVideoIds],
    reviewerId: m.review.reviewerId, reviewerVersion: m.review.reviewerVersion,
    evidenceId: m.review.evidenceId, reviewedAt: new Date().toISOString(), signature: ""
  };
  receipt.signature = sign(null, Buffer.from(productVisualReviewPayload(receipt)), key).toString("base64url");
  return receipt;
}
