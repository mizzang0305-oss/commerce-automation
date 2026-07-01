import { type ChannelKey } from "./channelProfiles";

export type ChannelUploadSettingsPreview = {
  version: "v048";
  channel_key: ChannelKey;
  visibility: "public";
  made_for_kids: false;
  contains_paid_promotion: true;
  paid_promotion_disclosure_required: true;
  paid_promotion_setting_verification: "REQUIRED_BEFORE_UPLOAD";
  paid_promotion_setting_verified: false;
  manual_paid_promotion_check_required: true;
  description_points_to_comment_link: true;
  comment_contains_affiliate_link: true;
  comment_contains_coupang_disclosure: true;
  raw_affiliate_url_printed: false;
  safe_to_upload: false;
  blocker: "MANUAL_PAID_PROMOTION_CHECK_REQUIRED";
};

export function buildChannelUploadSettingsPreview(channelKey: ChannelKey): ChannelUploadSettingsPreview {
  return {
    version: "v048",
    channel_key: channelKey,
    visibility: "public",
    made_for_kids: false,
    contains_paid_promotion: true,
    paid_promotion_disclosure_required: true,
    paid_promotion_setting_verification: "REQUIRED_BEFORE_UPLOAD",
    paid_promotion_setting_verified: false,
    manual_paid_promotion_check_required: true,
    description_points_to_comment_link: true,
    comment_contains_affiliate_link: true,
    comment_contains_coupang_disclosure: true,
    raw_affiliate_url_printed: false,
    safe_to_upload: false,
    blocker: "MANUAL_PAID_PROMOTION_CHECK_REQUIRED"
  };
}
