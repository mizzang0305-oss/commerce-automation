import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildV041ManualImageDropReview } from "../../src/uploads/multi-channel/manualImageDropReviewBuilder";
import { generateV044LocalCodexImages } from "./generate-v044-local-codex-images";

export async function generateV044LocalCodexImageReviewPackets(input: { cwd?: string } = {}) {
  const imageResult = await generateV044LocalCodexImages(input);
  if (imageResult.FINAL_STATUS !== "SUCCESS_V044_LOCAL_CODEX_IMAGES_MAPPED_TO_V041_MANUAL_DROP") {
    return {
      ...imageResult,
      review_packet_blocker: imageResult.quality_gate_blocker ?? imageResult.FINAL_STATUS,
      father_jobs_review_console: false,
      neoman_moleulgeol_review_console: false,
      lets_buy_review_console: false,
      videos_generated: false
    };
  }

  const review = await buildV041ManualImageDropReview(input);
  const ready = review.FINAL_STATUS === "SUCCESS_V041_MANUAL_IMAGE_DROP_REVIEW_PACKETS_READY";
  return {
    ...imageResult,
    FINAL_STATUS: ready
      ? "SUCCESS_V044_LOCAL_CODEX_IMAGE_SKILL_REVIEW_PACKETS_READY"
      : "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
    V044_LOCAL_CODEX_IMAGE_SKILL_READY: true,
    V044_REVIEW_PACKETS_READY: ready,
    SAFE_TO_UPLOAD: false,
    review_packet_blocker: ready ? null : review.review_packet_blocker,
    father_jobs_review_console: Boolean(review.channel_results.find((channel) => channel.channel_key === "father_jobs")?.review_console),
    neoman_moleulgeol_review_console: Boolean(review.channel_results.find((channel) => channel.channel_key === "neoman_moleulgeol")?.review_console),
    lets_buy_review_console: Boolean(review.channel_results.find((channel) => channel.channel_key === "lets_buy")?.review_console),
    videos_generated: review.videos_generated,
    channel_results: review.channel_results
  };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  generateV044LocalCodexImageReviewPackets()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V044_LOCAL_CODEX_IMAGE_SKILL_READY: result.V044_LOCAL_CODEX_IMAGE_SKILL_READY,
        V044_REVIEW_PACKETS_READY: result.V044_REVIEW_PACKETS_READY,
        SAFE_TO_UPLOAD: result.SAFE_TO_UPLOAD,
        generated_image_count: result.generated_image_count,
        generated_channels: result.generated_channels,
        quality_gate_pass: result.quality_gate_pass,
        review_packet_blocker: result.review_packet_blocker,
        videos_generated: result.videos_generated,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_urls_printed,
        secrets_printed: result.secrets_printed
      }, null, 2));
      if (!result.V044_REVIEW_PACKETS_READY) process.exitCode = 1;
    })
    .catch((error) => {
      console.error(JSON.stringify({
        FINAL_STATUS: "BLOCKED_LOCAL_CODEX_IMAGE_SKILL_OUTPUT_QUALITY_FAIL",
        message: error instanceof Error ? error.message : String(error),
        youtube_execute_called: false,
        videos_insert_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      }, null, 2));
      process.exitCode = 1;
    });
}
