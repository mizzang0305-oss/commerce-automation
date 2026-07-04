import crypto from "node:crypto";

import type { ChannelKey } from "../multi-channel/channelProfiles";
import type { V073UploadPackage } from "../multi-channel/v073UploadPackage";
import type {
  V075UploadResultStatus,
  V075UploadVisibility
} from "./v075CommentSafetyGate";

export type V075UploadResultEvidence = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  youtubeVideoId: string | null;
  youtubeVideoIdHash: string | null;
  uploadResultStatus: V075UploadResultStatus;
  uploadVisibility: V075UploadVisibility;
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
};

export type V075CommentPackage = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  youtubeVideoId: string | null;
  youtubeVideoIdHash: string | null;
  affiliateUrl: string | null;
  affiliateUrlHash: string | null;
  commentText: string;
  coupangDisclosurePresent: boolean;
  affiliateUrlPresent: boolean;
  uploadResultStatus: V075UploadResultStatus;
  uploadVisibility: V075UploadVisibility;
  targetChannelVerified: boolean;
  duplicateGuardSignature: string;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
  approvalRequired: true;
  commentWriteAllowed: false;
};

export type V075CommentPackageSanitizedReport = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  videoIdPresent: boolean;
  videoIdHashPrefix: string | null;
  affiliateUrlPresent: boolean;
  affiliateUrlHashPrefix: string | null;
  disclosurePresent: boolean;
  commentTextReady: boolean;
  uploadVisibility: V075UploadVisibility;
  uploadResultStatus: V075UploadResultStatus;
  targetChannelVerified: boolean;
  duplicateGuardPassed: boolean;
  publicUploadPackageReady: boolean;
  approvalRequired: true;
  commentWriteAllowed: false;
  safeToUpload: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export function buildV075CommentPackage(input: {
  uploadPackage: V073UploadPackage;
  uploadResult: V075UploadResultEvidence | null;
}): V075CommentPackage {
  const affiliateUrl = input.uploadPackage.deeplink.selectedAffiliateUrl?.trim() || null;
  const commentText = buildCommentText(input.uploadPackage.commentPackage.commentText, affiliateUrl);
  const youtubeVideoId = input.uploadResult?.youtubeVideoId?.trim() || null;

  return {
    uploadPackageId: input.uploadPackage.packageId,
    channelKey: input.uploadPackage.channelKey,
    youtubeVideoId,
    youtubeVideoIdHash: youtubeVideoId ? hashEvidence(youtubeVideoId) : input.uploadResult?.youtubeVideoIdHash ?? null,
    affiliateUrl,
    affiliateUrlHash: affiliateUrl ? hashEvidence(affiliateUrl) : null,
    commentText,
    coupangDisclosurePresent: input.uploadPackage.commentPackage.coupangPartnersDisclosurePresent &&
      hasCoupangPartnersDisclosure(commentText),
    affiliateUrlPresent: Boolean(affiliateUrl),
    uploadResultStatus: input.uploadResult?.uploadResultStatus ?? "missing",
    uploadVisibility: input.uploadResult?.uploadVisibility ?? null,
    targetChannelVerified: Boolean(input.uploadResult?.targetChannelVerified),
    duplicateGuardSignature: input.uploadPackage.duplicateGuard.signature,
    duplicateGuardPassed: Boolean(input.uploadResult?.duplicateGuardPassed),
    publicUploadPackageReady: Boolean(input.uploadResult?.publicUploadPackageReady),
    approvalRequired: true,
    commentWriteAllowed: false
  };
}

export function buildV075CommentPackageSanitizedReport(
  commentPackage: V075CommentPackage
): V075CommentPackageSanitizedReport {
  return {
    uploadPackageId: commentPackage.uploadPackageId,
    channelKey: commentPackage.channelKey,
    videoIdPresent: Boolean(commentPackage.youtubeVideoId),
    videoIdHashPrefix: safePrefix(commentPackage.youtubeVideoIdHash),
    affiliateUrlPresent: commentPackage.affiliateUrlPresent,
    affiliateUrlHashPrefix: safePrefix(commentPackage.affiliateUrlHash),
    disclosurePresent: commentPackage.coupangDisclosurePresent,
    commentTextReady: isV075CommentTextReady(commentPackage),
    uploadVisibility: commentPackage.uploadVisibility,
    uploadResultStatus: commentPackage.uploadResultStatus,
    targetChannelVerified: commentPackage.targetChannelVerified,
    duplicateGuardPassed: commentPackage.duplicateGuardPassed,
    publicUploadPackageReady: commentPackage.publicUploadPackageReady,
    approvalRequired: true,
    commentWriteAllowed: false,
    safeToUpload: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

export function isV075CommentTextReady(commentPackage: V075CommentPackage) {
  return Boolean(
    commentPackage.commentText.trim() &&
    commentPackage.affiliateUrlPresent &&
    commentPackage.coupangDisclosurePresent
  );
}

function buildCommentText(baseText: string, affiliateUrl: string | null) {
  const lines = [baseText.trim()].filter(Boolean);
  if (affiliateUrl && !baseText.includes(affiliateUrl)) {
    lines.push(affiliateUrl);
  }
  return lines.join("\n");
}

function hasCoupangPartnersDisclosure(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return normalized.includes("쿠팡파트너스") &&
    (normalized.includes("수수료") || normalized.includes("제공받"));
}

function hashEvidence(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function safePrefix(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}
