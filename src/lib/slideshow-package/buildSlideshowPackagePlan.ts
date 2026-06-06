import type { SelectedImageAssetPlan } from "@/lib/image-qa-import/types";
import { buildFfmpegCommandPreview } from "@/lib/slideshow-package/ffmpegPreview";
import { buildMoviePyScriptPreview } from "@/lib/slideshow-package/moviePyPreview";
import { buildSlideshowTimeline, buildTimelineMarkdown } from "@/lib/slideshow-package/timeline";
import type { SlideshowPackagePlan, SlideshowPackagePlanSideEffects } from "@/lib/slideshow-package/types";
import type { CommerceImageVideoPlan } from "@/lib/video-plans/types";
import type { ProductCandidate } from "@/types/automation";

export const slideshowPackagePlanSideEffects: SlideshowPackagePlanSideEffects = {
  external_api_called: false,
  scraped_live_web: false,
  image_generated: false,
  video_generated: false,
  uploaded: false,
  db_written: false,
  file_uploaded: false,
  local_file_read: false,
  local_file_written: false,
  google_drive_api_called: false,
  r2_uploaded: false,
  ffmpeg_executed: false,
  moviepy_executed: false,
  upload_package_created: false,
  payment_triggered: false,
  message_sent: false,
  deployment_triggered: false,
  worker_job_created: false,
  queue_created: false
};

const disclosure =
  "이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

const manualRenderChecklist = [
  "Confirm selected image assets passed manual QA before local rendering.",
  "Confirm every referenced image path exists in the operator-controlled local or sync folder.",
  "Copy the FFmpeg or MoviePy preview only into a separately approved local render environment.",
  "Run rendering manually outside the WebApp after approval.",
  "Review generated video output through a separate video QA/import bridge.",
  "Do not create, upload, or store video files from this planning screen.",
  "Keep local slideshow generation as a separate approval-gated PR."
];

const readyNextSteps = [
  "Copy the slideshow package JSON or timeline markdown for manual review.",
  "Use command previews only in a separately approved local render environment.",
  "Do not upload to R2 or create channel upload packages until a later approval-gated PR."
];

const blockedNextSteps = [
  "Resolve missing or rejected image assets before local slideshow generation.",
  "Re-run image QA import planning with passed or selected assets.",
  "Do not proceed to local rendering while ready_for_slideshow_plan=false."
];

function safeSlug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "slideshow";
}

function buildFallbackSelectedImageAssetPlan(candidateId: string): SelectedImageAssetPlan {
  return {
    id: `${candidateId}-selected-image-assets`,
    candidate_id: candidateId,
    selected_assets: [],
    required_asset_types: ["main_product", "benefit_scene", "hook_thumbnail", "comparison_card"],
    missing_required_asset_types: ["main_product", "benefit_scene", "hook_thumbnail", "comparison_card"],
    ready_for_slideshow_plan: false,
    next_step: "manual_review"
  };
}

export function buildSlideshowPackagePlan(
  candidate: ProductCandidate,
  selectedImageAssetPlan: SelectedImageAssetPlan | null | undefined,
  options: { now?: string; imageVideoPlan?: CommerceImageVideoPlan | null } = {}
): SlideshowPackagePlan {
  const createdAt = options.now ?? new Date().toISOString();
  const selectedPlan = selectedImageAssetPlan ?? buildFallbackSelectedImageAssetPlan(candidate.id);
  const selectedAssets = selectedPlan.selected_assets.filter(
    (asset) => asset.qa_status === "passed" || asset.qa_status === "selected"
  );
  const readyForSlideshow = selectedPlan.ready_for_slideshow_plan && selectedAssets.length >= 3;
  const timeline = readyForSlideshow ? buildSlideshowTimeline(candidate, selectedAssets) : [];
  const outputFilename = `${safeSlug(candidate.id)}-manual-slideshow-15s.mp4`;
  const outputFolder = `commerce-assets/output/slideshow/${candidate.id}/`;
  const uploadPackageFolder = `commerce-assets/output/video-packages/${candidate.id}/`;
  const narrationScript = timeline.map((item) => item.narration).join(" ");
  const subtitleLines = timeline.map((item) => `${item.start_sec}-${item.end_sec}s ${item.subtitle}`);
  const cta = "구매 전 상품 정보, 가격, 배송 조건, 제휴 링크를 직접 확인하세요.";
  const timelineMarkdown = buildTimelineMarkdown(timeline);

  const ffmpegCommandPreview = buildFfmpegCommandPreview(timeline, `${outputFolder}${outputFilename}`);
  const moviepyScriptPreview = buildMoviePyScriptPreview(timeline, `${outputFolder}${outputFilename}`);

  return {
    id: `${candidate.id}-slideshow-package-plan`,
    candidate_id: candidate.id,
    mode: "selected_image_slideshow_package_plan",
    package_type: "manual_slideshow_plan",
    format: "shorts_9_16",
    duration_sec: 15,
    ready_for_slideshow_plan: readyForSlideshow,
    selected_image_asset_plan: selectedPlan,
    timeline,
    image_sequence: timeline.map((item) => item.image_path_reference),
    narration_script: narrationScript,
    subtitle_lines: subtitleLines,
    timeline_markdown: timelineMarkdown,
    cta,
    affiliate_disclosure_reminder: disclosure,
    bgm_direction: "Use quiet, royalty-safe background music only after separate manual approval.",
    sfx_direction: ["Optional soft transition sound between shots.", "Avoid loud effects that obscure disclosure or subtitles."],
    ffmpeg_preview: {
      ffmpeg_command_preview: ffmpegCommandPreview,
      moviepy_script_preview: "",
      command_execution_allowed: false,
      requires_manual_approval: true
    },
    moviepy_preview: {
      ffmpeg_command_preview: "",
      moviepy_script_preview: moviepyScriptPreview,
      command_execution_allowed: false,
      requires_manual_approval: true
    },
    output_filename_suggestion: outputFilename,
    output_folder_suggestion: outputFolder,
    upload_package_folder_suggestion: uploadPackageFolder,
    manual_render_checklist: manualRenderChecklist,
    next_step_after_plan: readyForSlideshow ? readyNextSteps : blockedNextSteps,
    side_effects: { ...slideshowPackagePlanSideEffects },
    approval_required: true,
    created_at: createdAt
  };
}
