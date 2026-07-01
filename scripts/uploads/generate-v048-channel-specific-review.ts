import { buildV048ChannelSpecificReviewPackets } from "../../src/uploads/multi-channel/v048ChannelSpecificReviewBuilder";

buildV048ChannelSpecificReviewPackets()
  .then((result) => {
    const report = {
      FINAL_STATUS: result.FINAL_STATUS,
      V048_REVIEW_PACKETS_READY: result.V048_REVIEW_PACKETS_READY,
      SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
      v047_review_status: result.v047_review_status,
      fail_reasons: result.v047_fail_reasons,
      pr166_merge_allowed: result.pr166_merge_allowed,
      father_jobs_binding_pass: result.father_jobs_binding_pass,
      neoman_moleulgeol_binding_pass: result.neoman_moleulgeol_binding_pass,
      lets_buy_binding_pass: result.lets_buy_binding_pass,
      cross_channel_text_contamination: result.cross_channel_text_contamination,
      same_script_reused: result.same_script_reused,
      binding_blocker: result.binding_blocker,
      father_jobs_video_generated: result.father_jobs_video_generated,
      father_jobs_review_console: result.father_jobs_review_console,
      neoman_moleulgeol_video_generated: result.neoman_moleulgeol_video_generated,
      neoman_moleulgeol_review_console: result.neoman_moleulgeol_review_console,
      lets_buy_video_generated: result.lets_buy_video_generated,
      lets_buy_review_console: result.lets_buy_review_console,
      father_jobs_core_anchor_pass: result.father_jobs_core_anchor_pass,
      neoman_moleulgeol_core_anchor_pass: result.neoman_moleulgeol_core_anchor_pass,
      lets_buy_core_anchor_pass: result.lets_buy_core_anchor_pass,
      audio_blocker: result.audio_blocker,
      metadata_previews_generated: result.metadata_previews_generated,
      comment_previews_generated: result.comment_previews_generated,
      comment_link_present_all: result.comment_link_present_all,
      affiliate_disclosure_present_all: result.affiliate_disclosure_present_all,
      raw_affiliate_url_printed: result.raw_affiliate_url_printed,
      mojibake_present: result.mojibake_present,
      placeholder_url_present: result.placeholder_url_present,
      upload_settings_previews_generated: result.upload_settings_previews_generated,
      contains_paid_promotion_all: result.contains_paid_promotion_all,
      paid_promotion_setting_verified: result.paid_promotion_setting_verified,
      manual_paid_promotion_check_required: result.manual_paid_promotion_check_required,
      made_for_kids_false_all: result.made_for_kids_false_all,
      upload_settings_blocker: result.upload_settings_blocker,
      youtube_execute_called: result.youtube_execute_called,
      videos_insert_called: result.videos_insert_called,
      new_upload_attempted: result.new_upload_attempted,
      comment_create_update_delete_called: result.comment_create_update_delete_called,
      visibility_changed: result.visibility_changed,
      R2_upload: result.R2_upload,
      product_assets_write: result.product_assets_write,
      DB_write: result.DB_write,
      raw_urls_printed: result.raw_urls_printed,
      secrets_printed: result.secrets_printed,
      fake_success: result.fake_success
    };
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = result.V048_REVIEW_PACKETS_READY ? 0 : 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
