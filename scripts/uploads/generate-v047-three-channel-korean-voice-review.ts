import { buildV047ThreeChannelKoreanVoiceReviewPackets } from "../../src/uploads/multi-channel/v047ThreeChannelKoreanVoiceReviewBuilder";

buildV047ThreeChannelKoreanVoiceReviewPackets()
  .then((result) => {
    const report = {
      FINAL_STATUS: result.FINAL_STATUS,
      V047_THREE_CHANNEL_REVIEW_READY: result.V047_THREE_CHANNEL_REVIEW_READY,
      SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
      source_image_version: result.source_image_version,
      v046_generated_images_found: result.v046_generated_images_found,
      generated_image_count: result.generated_image_count,
      quality_gate_pass: result.quality_gate_pass,
      quality_gate_blocker: result.quality_gate_blocker,
      v035_renderer_reused: result.v035_renderer_reused,
      v035_metadata_builder_reused: result.v035_metadata_builder_reused,
      v035_review_console_reused: result.v035_review_console_reused,
      v035_melotts_voice_provider_restored: result.v035_melotts_voice_provider_restored,
      v035_melotts_provider_ready: result.v035_melotts_provider_ready,
      local_command_provider_ready: result.local_command_provider_ready,
      windows_sapi_used: result.windows_sapi_used,
      cloud_or_paid_voice_provider_used: result.cloud_or_paid_voice_provider_used,
      voice_provider_blocker: result.voice_provider_blocker,
      melotts_voice_used_all: result.melotts_voice_used_all,
      speech_rate_wpm_present_all: result.speech_rate_wpm_present_all,
      raw_similarity_score_present_all: result.raw_similarity_score_present_all,
      transcript_similarity_score_present_all: result.transcript_similarity_score_present_all,
      core_anchor_recognition_pass_all: result.core_anchor_recognition_pass_all,
      audio_blocker_all_clear: result.audio_blocker_all_clear,
      audio_validation_pass: result.audio_validation_pass,
      father_jobs_video_generated: result.father_jobs_video_generated,
      father_jobs_review_console: result.father_jobs_review_console,
      neoman_moleulgeol_video_generated: result.neoman_moleulgeol_video_generated,
      neoman_moleulgeol_review_console: result.neoman_moleulgeol_review_console,
      lets_buy_video_generated: result.lets_buy_video_generated,
      lets_buy_review_console: result.lets_buy_review_console,
      asset_to_frame_proof_pass: result.asset_to_frame_proof_pass,
      comment_previews_generated: result.comment_previews_generated,
      metadata_previews_generated: result.metadata_previews_generated,
      affiliate_disclosure_present_all: result.affiliate_disclosure_present_all,
      youtube_execute_called: result.youtube_execute_called,
      videos_insert_called: result.videos_insert_called,
      new_upload_attempted: result.new_upload_attempted,
      private_upload: result.private_upload,
      public_upload: result.public_upload,
      unlisted_upload: result.unlisted_upload,
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
    process.exitCode = result.V047_THREE_CHANNEL_REVIEW_READY ? 0 : 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
