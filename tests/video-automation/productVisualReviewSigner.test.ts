import { createHash, generateKeyPairSync } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { signProductVisualReview, type ProductVisualSigningManifest } from "@/lib/video-automation/productVisualReviewSigner";
import { productVisualReviewPayload, verifyProductVisualReview } from "@/lib/video-automation/productVisualReview";

const productId = "coupang:product:100:item:200:vendor:300";
const priorIds = ["t4F3OHxGGeg", "f9zPg0OEqG8"];
const priorPublications = priorIds.map((youtubeVideoId, index) => ({ youtubeVideoId, productId: `coupang:product:${101 + index}:item:200:vendor:300` }));
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const keys = generateKeyPairSync("ed25519");
const privateKeyPem = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKey = keys.publicKey.export({ type: "spki", format: "pem" }).toString();
let root: string;
let manifest: ProductVisualSigningManifest;

async function file(name: string, bytes: string) {
  const fullPath = path.join(root, name);
  await writeFile(fullPath, bytes);
  return { path: fullPath, sha256: sha(bytes) };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "product-visual-signer-"));
  const review = await file("review.txt", "Human inspected full video/audio and usage rights in this fixture.");
  const attestation = { status: "passed" as const, evidencePath: review.path, reviewerId: "test-reviewer", reviewedAt: "2026-09-24T00:00:00Z" };
  manifest = {
    schema: "product-visual-signing-manifest/v1", productId, canonicalProductName: "정확한 상품명",
    affiliateProductId: productId, affiliateUrl: "https://link.coupang.com/a/exact",
    files: {
      video: await file("video.mp4", "real-video-fixture"),
      audio: await file("tts.wav", "tts-fixture"),
      narration: await file("narration.json", "narration-fixture"),
      script: await file("script.txt", "script-fixture"),
      sourceImages: [{ ...(await file("image.jpg", "product-image-fixture")), productId,
        rightsStatus: "verified", rightsEvidenceId: "TEST_RIGHTS", rightsEvidencePath: review.path,
        policyReference: "TEST_ONLY_CONTRACT" }]
    },
    review: { productIdentity: { ...attestation }, affiliateIdentity: { ...attestation },
      fullHumanContent: { ...attestation }, exactSpokenName: { ...attestation }, rights: { ...attestation }, crossVideo: { ...attestation },
      priorPublicationSimilarityResult: "distinct", reviewedPriorVideoIds: [...priorIds],
      priorPublicationSources: priorPublications.map((entry, index) => ({ ...entry, sourceSha256: [String(index + 1).repeat(64)] })),
      reviewerId: "test-reviewer", reviewerVersion: "test-v1", evidenceId: "TEST_EVIDENCE" }
  };
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

const signFixture = () => signProductVisualReview({ manifest, currentPriorPublications: priorPublications, privateKeyPem });

describe("independent product visual signing gate", () => {
  test("signer and publisher verifier serialize the same payload bytes", async () => {
    const receipt = await signFixture();
    expect(verifyProductVisualReview({ receipt, productId, canonicalProductName: manifest.canonicalProductName, affiliateProductId: productId,
      affiliateUrl: manifest.affiliateUrl, videoSha256: manifest.files.video.sha256, publicKey, requiredPriorVideoIds: priorIds })).toEqual({ ok: true });
    expect(productVisualReviewPayload(receipt)).not.toContain("signature");
    expect(receipt.signature.length).toBeGreaterThan(80);
  });

  test.each([
    ["other product", (m: ProductVisualSigningManifest) => { m.affiliateProductId = "coupang:product:101:item:200:vendor:300"; }, "PRODUCT_IDENTITY_INVALID"],
    ["missing human review", (m: ProductVisualSigningManifest) => { m.review.fullHumanContent.status = "unverified"; }, "FULLHUMANCONTENT_REVIEW_MISSING"],
    ["missing affiliate binding review", (m: ProductVisualSigningManifest) => { m.review.affiliateIdentity.status = "unverified"; }, "AFFILIATEIDENTITY_REVIEW_MISSING"],
    ["missing exact spoken name", (m: ProductVisualSigningManifest) => { m.review.exactSpokenName.status = "unverified"; }, "EXACTSPOKENNAME_REVIEW_MISSING"],
    ["missing rights", (m: ProductVisualSigningManifest) => { m.files.sourceImages[0].rightsStatus = "unverified"; }, "SOURCE_RIGHTS_UNVERIFIED"],
    ["missing cross-video review", (m: ProductVisualSigningManifest) => { m.review.crossVideo.status = "unverified"; }, "CROSSVIDEO_REVIEW_MISSING"],
    ["stale ledger", (m: ProductVisualSigningManifest) => { m.review.reviewedPriorVideoIds.pop(); }, "PRIOR_PUBLICATION_REVIEW_STALE"],
    ["same image twice", (m: ProductVisualSigningManifest) => { m.files.sourceImages.push({ ...m.files.sourceImages[0] }); }, "SOURCE_IMAGE_DUPLICATED"],
    ["wrong image product", (m: ProductVisualSigningManifest) => { m.files.sourceImages[0].productId = "coupang:product:101:item:200:vendor:300"; }, "SOURCE_PRODUCT_MISMATCH"],
    ["missing rights policy reference", (m: ProductVisualSigningManifest) => { m.files.sourceImages[0].policyReference = ""; }, "SOURCE_RIGHTS_UNVERIFIED"],
    ["reused body with different intro", (m: ProductVisualSigningManifest) => { m.review.priorPublicationSources[0].sourceSha256 = [m.files.sourceImages[0].sha256]; }, "CROSS_PRODUCT_BODY_SOURCE_REUSED"],
    ["mismatched prior product binding", (m: ProductVisualSigningManifest) => { m.review.priorPublicationSources[0].productId = m.productId; }, "PRIOR_PUBLICATION_SOURCE_EVIDENCE_MISSING"]
  ])("rejects %s", async (_name, mutate, expected) => {
    mutate(manifest);
    await expect(signFixture()).rejects.toMatchObject({ safeCode: expected });
  });

  test.each([
    ["affiliate URL", () => { manifest.affiliateUrl = "http://invalid"; }, "PRODUCT_IDENTITY_INVALID"],
    ["image bytes", async () => { await writeFile(manifest.files.sourceImages[0].path, "changed"); }, "SOURCE_IMAGE_HASH_MISMATCH"],
    ["narration bytes", async () => { await writeFile(manifest.files.narration.path, "changed"); }, "NARRATION_HASH_MISMATCH"],
    ["audio bytes", async () => { await writeFile(manifest.files.audio.path, "changed"); }, "AUDIO_HASH_MISMATCH"],
    ["video bytes", async () => { await writeFile(manifest.files.video.path, "changed"); }, "VIDEO_HASH_MISMATCH"],
    ["script bytes", async () => { await writeFile(manifest.files.script.path, "changed"); }, "SCRIPT_HASH_MISMATCH"]
  ])("rejects changed %s before signing", async (_name, mutate, expected) => {
    await mutate();
    await expect(signFixture()).rejects.toMatchObject({ safeCode: expected });
  });

  test("wrong public key, forged name and unsigned receipt fail the publisher verifier", async () => {
    const receipt = await signFixture();
    const context = { productId, canonicalProductName: manifest.canonicalProductName, affiliateProductId: productId,
      affiliateUrl: manifest.affiliateUrl, videoSha256: receipt.videoSha256, requiredPriorVideoIds: priorIds };
    const other = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    expect(verifyProductVisualReview({ receipt, ...context, publicKey: other }).ok).toBe(false);
    expect(verifyProductVisualReview({ receipt: { ...receipt, canonicalProductName: "다른 이름" }, ...context, publicKey }).ok).toBe(false);
    expect(verifyProductVisualReview({ receipt: { ...receipt, signature: "" }, ...context, publicKey }).ok).toBe(false);
    expect(verifyProductVisualReview({ receipt, ...context, publicKey, videoSha256: sha(await readFile(manifest.files.audio.path)) }).ok).toBe(false);
  });

  test("rejects a current ledger entry for the same product on another channel", async () => {
    const publications = priorPublications.map((entry, index) => index === 0 ? { ...entry, productId } : entry);
    manifest.review.priorPublicationSources[0].productId = productId;
    await expect(signProductVisualReview({ manifest, currentPriorPublications: publications, privateKeyPem }))
      .rejects.toMatchObject({ safeCode: "PRODUCT_ALREADY_PUBLISHED" });
  });
});
