import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildV043AutomaticRealImageReview } from "../../src/uploads/multi-channel/automaticRealImageReviewBuilder";

export async function writeV043AutomaticRealImageReviewPackets(input: { cwd?: string } = {}) {
  return buildV043AutomaticRealImageReview(input);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  writeV043AutomaticRealImageReviewPackets()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V043_AUTO_IMAGE_READY: result.V043_AUTO_IMAGE_READY,
        V043_REVIEW_PACKETS_READY: result.V043_REVIEW_PACKETS_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        active_provider: result.active_provider,
        provider_configured: result.provider_configured,
        provider_available: result.provider_available,
        provider_blocker: result.provider_blocker,
        automatic_image_generation_attempted: result.automatic_image_generation_attempted,
        generated_scene_asset_count: result.generated_scene_asset_count,
        generated_channels: result.generated_channels,
        real_image_semantic_pass: result.real_image_semantic_pass,
        semantic_blocker: result.semantic_blocker,
        videos_generated: result.videos_generated,
        review_packet_blocker: result.review_packet_blocker,
        manual_pack_fallback_available: result.manual_pack_fallback_available,
        fallback_reason: result.fallback_reason,
        artifacts: result.artifacts,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
      if (result.FINAL_STATUS !== "SUCCESS_V043_AUTO_REAL_IMAGE_REVIEW_PACKETS_READY") {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_REAL_IMAGE_PROVIDER_NOT_CONFIGURED",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
