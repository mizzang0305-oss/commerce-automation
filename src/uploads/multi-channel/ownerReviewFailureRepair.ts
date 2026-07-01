import type { ChannelKey } from "./channelProfiles";

export const V051_OWNER_REVIEW_FAILURE_VIDEO_IDS: Record<ChannelKey, string> = {
  father_jobs: "sQraJxxf7Do",
  neoman_moleulgeol: "aIzCjh_mKgY",
  lets_buy: "Cos-eVLqCeU"
};

export type V055OwnerReviewFailureReport = {
  version: "v055";
  owner_review_status: "OWNER_REVIEW_FAIL";
  one_channel_upload_detected: true;
  ai_disclosure_missing: true;
  comment_link_not_visible: true;
  hook_text_too_small: true;
  existing_videos: Record<ChannelKey, string>;
  remediation_plan_created: true;
  remediation_plan: string[];
  existing_video_mutated: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  new_upload_attempted: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export function buildV055OwnerReviewFailureReport(): V055OwnerReviewFailureReport {
  return {
    version: "v055",
    owner_review_status: "OWNER_REVIEW_FAIL",
    one_channel_upload_detected: true,
    ai_disclosure_missing: true,
    comment_link_not_visible: true,
    hook_text_too_small: true,
    existing_videos: V051_OWNER_REVIEW_FAILURE_VIDEO_IDS,
    remediation_plan_created: true,
    remediation_plan: [
      "wrong channel videos should be manually set private or deleted",
      "AI use should be set to Yes",
      "paid product placement should be checked",
      "missing comments should be manually added or re-commented only after fresh approval",
      "corrected videos require fresh re-upload approval after v055 merge"
    ],
    existing_video_mutated: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    new_upload_attempted: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}
