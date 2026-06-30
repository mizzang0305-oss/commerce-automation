import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildV045ThreeChannelV035ReviewPackets } from "../../src/uploads/multi-channel/threeChannelV035ReviewBuilder";

export { buildV045ThreeChannelV035ReviewPackets };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  buildV045ThreeChannelV035ReviewPackets()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V045_THREE_CHANNEL_REVIEW_READY: result.V045_THREE_CHANNEL_REVIEW_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        v035_success_pipeline_found: result.v035_success_pipeline_found,
        v035_renderer_reused: result.v035_renderer_reused,
        father_jobs_video_generated: result.father_jobs_video_generated,
        neoman_moleulgeol_video_generated: result.neoman_moleulgeol_video_generated,
        lets_buy_video_generated: result.lets_buy_video_generated,
        color_bar_detected: result.color_bar_detected,
        solid_placeholder_detected: result.solid_placeholder_detected,
        mosaic_placeholder_detected: result.mosaic_placeholder_detected,
        checkerboard_detected: result.checkerboard_detected,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
      if (!result.V045_THREE_CHANNEL_REVIEW_READY) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_V045_RESTORE_V035_RENDERER",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
