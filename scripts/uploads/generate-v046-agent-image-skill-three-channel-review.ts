import { buildV046ThreeChannelReviewPackets } from "../../src/uploads/multi-channel/v046ThreeChannelReviewBuilder";

buildV046ThreeChannelReviewPackets()
  .then((result) => {
    const report = {
      FINAL_STATUS: result.FINAL_STATUS,
      V046_THREE_CHANNEL_REVIEW_READY: result.V046_THREE_CHANNEL_REVIEW_READY,
      SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
      agent_image_generation_attempted: result.agent_image_generation_attempted,
      generated_image_count: result.generated_image_count,
      generated_channels: result.generated_channels,
      handoff_manifest: result.handoff_manifest,
      generated_image_contact_sheet: result.generated_image_contact_sheet,
      quality_gate_pass: result.quality_gate_pass,
      quality_gate_blocker: result.quality_gate_blocker,
      v035_renderer_reused: result.v035_renderer_reused,
      v037_renderer_used: result.v037_renderer_used,
      v038_renderer_used: result.v038_renderer_used,
      v039_renderer_used: result.v039_renderer_used,
      manual_drop_primary_used: result.manual_drop_primary_used,
      father_jobs_video_generated: result.father_jobs_video_generated,
      father_jobs_review_console: result.father_jobs_review_console,
      neoman_moleulgeol_video_generated: result.neoman_moleulgeol_video_generated,
      neoman_moleulgeol_review_console: result.neoman_moleulgeol_review_console,
      lets_buy_video_generated: result.lets_buy_video_generated,
      lets_buy_review_console: result.lets_buy_review_console,
      color_bar_detected: result.color_bar_detected,
      solid_placeholder_detected: result.solid_placeholder_detected,
      mosaic_placeholder_detected: result.mosaic_placeholder_detected,
      checkerboard_detected: result.checkerboard_detected,
      real_scene_assets_visible: result.real_scene_assets_visible,
      asset_to_frame_proof_pass: result.asset_to_frame_proof_pass,
      comment_previews_generated: result.comment_previews_generated,
      metadata_previews_generated: result.metadata_previews_generated,
      affiliate_disclosure_present_all: result.affiliate_disclosure_present_all,
      comment_link_present_all: result.comment_link_present_all,
      raw_affiliate_url_printed: result.raw_affiliate_url_printed,
      mojibake_present: result.mojibake_present,
      placeholder_url_present: result.placeholder_url_present,
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
    process.exitCode = result.V046_THREE_CHANNEL_REVIEW_READY ? 0 : 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
