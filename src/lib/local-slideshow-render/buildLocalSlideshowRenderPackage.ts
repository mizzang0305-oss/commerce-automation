import {
  localSlideshowRenderConfirmationPhrase,
  localSlideshowRenderSideEffects
} from "@/lib/local-slideshow-render/constants";
import { buildInputAssetsChecklist, buildLocalRenderPowerShellSteps } from "@/lib/local-slideshow-render/powershellSteps";
import type { LocalSlideshowRenderPackage } from "@/lib/local-slideshow-render/types";
import type { SlideshowPackagePlan } from "@/lib/slideshow-package";
import type { ProductCandidate } from "@/types/automation";

export { localSlideshowRenderConfirmationPhrase, localSlideshowRenderSideEffects };

const manualExecutionChecklist = [
  "Confirm this package is copy-only and execution_enabled=false.",
  "Confirm selected image assets passed manual QA.",
  "Confirm local paths and output folders manually outside the WebApp.",
  "Run FFmpeg/MoviePy manually only after separate explicit execution approval.",
  "Review the generated video through the generated video QA import bridge before any upload package work."
];

function buildOutputPaths(plan: SlideshowPackagePlan) {
  return [
    `${plan.output_folder_suggestion}${plan.output_filename_suggestion}`,
    plan.upload_package_folder_suggestion
  ];
}

export function buildLocalSlideshowRenderPackage(
  candidate: ProductCandidate,
  slideshowPackagePlan: SlideshowPackagePlan,
  options: { confirmation?: string; now?: string } = {}
): LocalSlideshowRenderPackage {
  const confirmationMatched = options.confirmation === localSlideshowRenderConfirmationPhrase;

  return {
    id: `${candidate.id}-local-slideshow-render-package`,
    candidate_id: candidate.id,
    mode: "local_slideshow_render_bridge",
    package_type: "manual_local_render_package",
    confirmation_required: localSlideshowRenderConfirmationPhrase,
    confirmation_matched: confirmationMatched,
    execution_enabled: false,
    slideshow_package_plan: slideshowPackagePlan,
    ffmpeg_command_preview: slideshowPackagePlan.ffmpeg_preview.ffmpeg_command_preview,
    moviepy_script_preview: slideshowPackagePlan.moviepy_preview.moviepy_script_preview,
    powershell_steps_markdown: buildLocalRenderPowerShellSteps(slideshowPackagePlan),
    input_assets_checklist: buildInputAssetsChecklist(slideshowPackagePlan),
    output_paths: buildOutputPaths(slideshowPackagePlan),
    manual_execution_checklist: manualExecutionChecklist,
    side_effects: { ...localSlideshowRenderSideEffects },
    approval_required: true,
    created_at: options.now ?? new Date().toISOString()
  };
}
