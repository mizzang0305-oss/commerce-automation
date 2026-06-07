import type { SlideshowPackagePlan } from "@/lib/slideshow-package";

export function buildLocalRenderPowerShellSteps(plan: SlideshowPackagePlan) {
  return [
    "# Copy only. The WebApp does not execute these steps.",
    "# Use a separate local PowerShell after explicit execution approval.",
    "# 1. Confirm every image path in the slideshow package exists locally.",
    "# 2. Confirm the output folder is operator-controlled.",
    "# 3. Copy one preview command or script into the approved local render environment.",
    "# 4. Review the resulting video manually before any upload package work.",
    "",
    `# Suggested output file: ${plan.output_folder_suggestion}${plan.output_filename_suggestion}`,
    `# Suggested package folder: ${plan.upload_package_folder_suggestion}`
  ].join("\n");
}

export function buildInputAssetsChecklist(plan: SlideshowPackagePlan) {
  if (plan.timeline.length === 0) {
    return ["Resolve selected image QA readiness before preparing local render inputs."];
  }

  return plan.timeline.map(
    (item) => `Confirm ${item.asset_type} path manually: ${item.image_path_reference}`
  );
}
