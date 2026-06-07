import { generatedVideoQaImportPlanSideEffects } from "@/lib/video-qa-import/constants";
import { generatedVideoBaseQaChecklist, generatedVideoNextSteps } from "@/lib/video-qa-import/videoQaChecklist";
import type {
  GeneratedVideoAssetCandidate,
  GeneratedVideoManifest,
  GeneratedVideoQaImportPlan
} from "@/lib/video-qa-import/types";
import type { ProductCandidate } from "@/types/automation";

export { generatedVideoQaImportPlanSideEffects };

function isAcceptedForManualUpload(video: GeneratedVideoAssetCandidate) {
  return video.qa_status === "passed" || video.qa_status === "selected_for_manual_upload";
}

function buildSafetyFlags(video: GeneratedVideoAssetCandidate) {
  const flags: string[] = [];
  if (video.format !== "shorts_9_16") {
    flags.push("format_requires_manual_review");
  }
  if (video.duration_sec === null) {
    flags.push("duration_requires_manual_confirmation");
  } else if (video.duration_sec < 10 || video.duration_sec > 60) {
    flags.push("duration_outside_short_form_range");
  }
  if (video.qa_status === "rejected") {
    flags.push("rejected_video_excluded");
  }
  if (video.qa_status === "needs_fix") {
    flags.push("needs_fix_before_manual_upload");
  }
  return flags;
}

function buildChecklist(video: GeneratedVideoAssetCandidate) {
  const checklist = [...generatedVideoBaseQaChecklist];
  if (video.duration_sec === null) {
    checklist.push("Confirm video duration manually; this bridge does not read video metadata.");
  }
  if (video.format === "unknown") {
    checklist.push("Confirm video aspect ratio manually; this bridge does not inspect video dimensions.");
  }
  return checklist;
}

function buildMissingRequirements(videos: GeneratedVideoAssetCandidate[]) {
  const missing = new Set<string>();
  const accepted = videos.filter(isAcceptedForManualUpload);

  if (accepted.length === 0) {
    missing.add("At least one passed or selected_for_manual_upload video is required.");
  }

  for (const video of accepted) {
    if (video.format !== "shorts_9_16") {
      missing.add("Manual upload package readiness requires format=shorts_9_16.");
    }
    if (video.duration_sec === null) {
      missing.add("Video duration must be manually confirmed between 10 and 60 seconds.");
    } else if (video.duration_sec < 10 || video.duration_sec > 60) {
      missing.add("Video duration must be between 10 and 60 seconds.");
    }
  }

  return Array.from(missing);
}

function buildQaMarkdown(plan: Omit<GeneratedVideoQaImportPlan, "qa_markdown">) {
  const lines = [
    `# Generated Video QA Import Plan: ${plan.candidate_id}`,
    "",
    "- mode: generated_video_qa_import_bridge",
    "- package_type: manual_video_qa_import_plan",
    `- ready_for_manual_upload_package: ${String(plan.ready_for_manual_upload_package)}`,
    "- approval_required: true",
    "- side_effects: external_api_called=false, video_generated=false, uploaded=false, db_written=false, file_uploaded=false, local_file_read=false, local_file_written=false, r2_uploaded=false, ffmpeg_executed=false, moviepy_executed=false, upload_package_created=false, worker_job_created=false, queue_created=false",
    "",
    "## Videos"
  ];

  for (const video of plan.videos) {
    lines.push(
      "",
      `### ${video.provided_filename}`,
      `- provided_path: ${video.provided_path}`,
      `- source: ${video.source}`,
      `- duration_sec: ${video.duration_sec ?? "manual_review_required"}`,
      `- format: ${video.format}`,
      `- qa_status: ${video.qa_status}`,
      `- safety_flags: ${video.safety_flags.join(", ") || "none"}`,
      "- checklist:",
      ...video.qa_checklist.map((item) => `  - ${item}`)
    );
  }

  lines.push(
    "",
    "## Missing Requirements",
    ...(plan.missing_requirements.length > 0 ? plan.missing_requirements.map((item) => `- ${item}`) : ["- none"]),
    "",
    "## Next Step After QA",
    ...plan.next_step_after_qa.map((step) => `- ${step}`)
  );

  return lines.join("\n");
}

export function buildGeneratedVideoQaImportPlan(
  candidate: ProductCandidate,
  manifest: GeneratedVideoManifest | null | undefined,
  options: { now?: string } = {}
): GeneratedVideoQaImportPlan {
  const createdAt = options.now ?? new Date().toISOString();
  const videos: GeneratedVideoAssetCandidate[] = (manifest?.videos ?? []).map((video, index) => {
    const candidateVideo: GeneratedVideoAssetCandidate = {
      id: `${candidate.id}-generated-video-${index + 1}`,
      candidate_id: candidate.id,
      ...video,
      qa_checklist: [],
      safety_flags: []
    };
    candidateVideo.safety_flags = buildSafetyFlags(candidateVideo);
    candidateVideo.qa_checklist = buildChecklist(candidateVideo);
    return candidateVideo;
  });

  const missingRequirements = buildMissingRequirements(videos);
  const readyForManualUploadPackage = missingRequirements.length === 0;
  const importManifestJson = JSON.stringify(
    {
      candidate_id: candidate.id,
      videos: videos.map((video) => ({
        provided_filename: video.provided_filename,
        provided_path: video.provided_path,
        source: video.source,
        duration_sec: video.duration_sec,
        format: video.format,
        qa_status: video.qa_status,
        qa_notes: video.qa_notes
      }))
    },
    null,
    2
  );

  const planWithoutMarkdown = {
    id: `${candidate.id}-generated-video-qa-import-plan`,
    candidate_id: candidate.id,
    mode: "generated_video_qa_import_bridge" as const,
    package_type: "manual_video_qa_import_plan" as const,
    videos,
    ready_for_manual_upload_package: readyForManualUploadPackage,
    missing_requirements: missingRequirements,
    import_manifest_json: importManifestJson,
    next_step_after_qa: generatedVideoNextSteps,
    side_effects: { ...generatedVideoQaImportPlanSideEffects },
    approval_required: true as const,
    created_at: createdAt
  };

  return {
    ...planWithoutMarkdown,
    qa_markdown: buildQaMarkdown(planWithoutMarkdown)
  };
}
