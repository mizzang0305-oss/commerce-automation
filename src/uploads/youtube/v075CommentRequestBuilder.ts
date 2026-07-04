import type { ChannelKey } from "../multi-channel/channelProfiles";
import type { V075CommentPackage } from "./v075CommentPackage";

export type V075YouTubeCommentRequest = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  videoId: string | null;
  textOriginal: string;
  disclosurePresent: boolean;
  affiliateUrlPresent: boolean;
  sanitizedEvidence: {
    videoIdPresent: boolean;
    videoIdHashPrefix: string | null;
    affiliateUrlPresent: boolean;
    affiliateUrlHashPrefix: string | null;
    rawUrlsPrinted: false;
    rawVideoIdsPrinted: false;
    rawChannelIdsPrinted: false;
    secretsPrinted: false;
  };
  adapterMode: "not_selected";
  commentCreateCalled: false;
};

export type V075YouTubeCommentRequestSanitizedReport = {
  uploadPackageId: string;
  channelKey: ChannelKey;
  videoIdPresent: boolean;
  videoIdHashPrefix: string | null;
  affiliateUrlPresent: boolean;
  affiliateUrlHashPrefix: string | null;
  disclosurePresent: boolean;
  commentTextReady: boolean;
  adapterMode: "not_selected";
  commentCreateCalled: false;
  commentThreads_insert_called: false;
  safeToUpload: false;
  raw_urls_printed: false;
  raw_video_ids_printed: false;
  raw_channel_ids_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export function buildV075YouTubeCommentRequest(
  commentPackage: V075CommentPackage
): V075YouTubeCommentRequest {
  return {
    uploadPackageId: commentPackage.uploadPackageId,
    channelKey: commentPackage.channelKey,
    videoId: commentPackage.youtubeVideoId,
    textOriginal: commentPackage.commentText,
    disclosurePresent: commentPackage.coupangDisclosurePresent,
    affiliateUrlPresent: commentPackage.affiliateUrlPresent,
    sanitizedEvidence: {
      videoIdPresent: Boolean(commentPackage.youtubeVideoId),
      videoIdHashPrefix: safePrefix(commentPackage.youtubeVideoIdHash),
      affiliateUrlPresent: commentPackage.affiliateUrlPresent,
      affiliateUrlHashPrefix: safePrefix(commentPackage.affiliateUrlHash),
      rawUrlsPrinted: false,
      rawVideoIdsPrinted: false,
      rawChannelIdsPrinted: false,
      secretsPrinted: false
    },
    adapterMode: "not_selected",
    commentCreateCalled: false
  };
}

export function buildV075YouTubeCommentRequestSanitizedReport(
  request: V075YouTubeCommentRequest
): V075YouTubeCommentRequestSanitizedReport {
  return {
    uploadPackageId: request.uploadPackageId,
    channelKey: request.channelKey,
    videoIdPresent: request.sanitizedEvidence.videoIdPresent,
    videoIdHashPrefix: request.sanitizedEvidence.videoIdHashPrefix,
    affiliateUrlPresent: request.affiliateUrlPresent,
    affiliateUrlHashPrefix: request.sanitizedEvidence.affiliateUrlHashPrefix,
    disclosurePresent: request.disclosurePresent,
    commentTextReady: Boolean(request.textOriginal.trim() && request.disclosurePresent && request.affiliateUrlPresent),
    adapterMode: "not_selected",
    commentCreateCalled: false,
    commentThreads_insert_called: false,
    safeToUpload: false,
    raw_urls_printed: false,
    raw_video_ids_printed: false,
    raw_channel_ids_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function safePrefix(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}
