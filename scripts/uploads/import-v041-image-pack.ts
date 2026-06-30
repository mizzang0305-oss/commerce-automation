import path from "node:path";
import { fileURLToPath } from "node:url";

import { importV041ImagePack } from "../../src/uploads/multi-channel/imagePackImporter";

export async function runImportV041ImagePack(input: { cwd?: string } = {}) {
  return importV041ImagePack(input);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runImportV041ImagePack()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V042_IMPORTER_READY: result.V042_IMPORTER_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        source_mode: result.source_mode,
        required_image_count: result.required_image_count,
        imported_image_count: result.imported_image_count,
        all_required_images_present: result.all_required_images_present,
        all_images_decode_success: result.all_images_decode_success,
        all_images_portrait: result.all_images_portrait,
        all_images_min_width: result.all_images_min_width,
        all_images_min_height: result.all_images_min_height,
        all_images_file_size_gt_50000: result.all_images_file_size_gt_50000,
        mosaic_pattern_detected: result.mosaic_pattern_detected,
        checkerboard_pattern_detected: result.checkerboard_pattern_detected,
        noise_texture_detected: result.noise_texture_detected,
        placeholder_detected: result.placeholder_detected,
        mapping_confidence: result.mapping_confidence,
        validation_blocker: result.validation_blocker,
        artifacts: result.artifacts,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
      if (result.FINAL_STATUS !== "SUCCESS_V042_IMAGE_PACK_IMPORTED_READY_FOR_REVIEW_V041") {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_V042_IMAGE_PACK_IMPORT",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
