import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildV043AutomaticRealImageReview } from "../../src/uploads/multi-channel/automaticRealImageReviewBuilder";

export async function checkV043RealImageProvider(input: { cwd?: string } = {}) {
  return buildV043AutomaticRealImageReview(input);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  checkV043RealImageProvider()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        provider_priority: result.provider_priority,
        active_provider: result.active_provider,
        provider_configured: result.provider_configured,
        provider_test_image_generated: result.provider_test_image_generated,
        provider_available: result.provider_available,
        provider_blocker: result.provider_blocker,
        artifacts: {
          real_image_provider_setup_guide: result.artifacts.real_image_provider_setup_guide,
          provider_status: result.artifacts.provider_status,
          scene_prompt_package: result.artifacts.scene_prompt_package,
          fallback_to_v042_image_pack_guide: result.artifacts.fallback_to_v042_image_pack_guide
        },
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
      if (result.FINAL_STATUS === "BLOCKED_REAL_IMAGE_PROVIDER_NOT_CONFIGURED") {
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
