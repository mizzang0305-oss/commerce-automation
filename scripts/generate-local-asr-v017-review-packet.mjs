import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildRealStoryboardGateProbe,
  buildV015RealSceneSourceManifest
} from "./generate-local-asr-v015-review-packet.mjs";
import {
  buildKoreanVoiceProviderSafeSummary,
  evaluateKoreanVoiceProviderReadiness,
  validateOwnerRecordedVoiceFile
} from "./korean-voice-provider-readiness.mjs";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const TARGET_VERSION = "v017";
const CANONICAL_PRODUCT_NAME = "\uCF54\uBA67 \uD648 \uC811\uC774\uC2DD \uB300\uD615 \uBE68\uB798\uAC74\uC870\uB300";
const VOICEOVER_SCRIPT = [
  "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uC2E4\uD328, \uADF8\uB0E5 \uB118\uAE30\uBA74 \uC190\uD574\uC785\uB2C8\uB2E4.",
  "\uBE44 \uC624\uB294 \uB0A0\uC5D0 \uBE68\uB798\uAC00 \uB354\uB514\uAC8C \uB9C8\uB974\uACE0 \uC9D1\uC548\uC5D0 \uC2B5\uAE30\uAC00 \uB0A8\uC2B5\uB2C8\uB2E4.",
  "\uC881\uC740 \uACF5\uAC04\uC774\uB77C\uBA74 \uBE68\uB798 \uB110 \uC790\uB9AC\uB3C4 \uBD80\uC871\uD574\uC9D1\uB2C8\uB2E4.",
  "\uC811\uC774\uC2DD \uBE68\uB798 \uAC74\uC870\uB300\uB294 \uC881\uC740 \uACF5\uAC04\uC5D0\uC11C\uB3C4 \uBE68\uB798\uB97C \uD55C\uBC88\uC5D0 \uB9D0\uB9B4 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
  "\uAD6C\uB9E4 \uC804\uC5D0\uB294 \uD06C\uAE30, \uD558\uC911, \uBCF4\uAD00 \uACF5\uAC04\uC744 \uAF2D \uD655\uC778\uD558\uC138\uC694."
];

export async function generateV017ReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const readinessPath = path.join(reviewRoot, "voice-provider-readiness.json");
  const env = input.env ?? await loadLocalEnv(cwd);
  const baseVoiceProvider = evaluateKoreanVoiceProviderReadiness(env);
  const ownerRecordedValidation = baseVoiceProvider.providerType === "owner_recorded"
    ? await validateOwnerRecordedVoiceFile(env.KOREAN_VOICE_SOURCE_PATH ?? env.KOREAN_VOICE_MODEL_PATH)
    : null;
  const voiceProvider = applyOwnerRecordedValidation(baseVoiceProvider, ownerRecordedValidation);
  const realStoryboard = buildRealStoryboardGateProbe(buildV015RealSceneSourceManifest());
  await fs.mkdir(reviewRoot, { recursive: true });
  await writeJson(readinessPath, {
    ...voiceProvider,
    ownerRecordedValidation
  });
  await fs.writeFile(path.join(reviewRoot, "voice-provider-safe-summary.txt"), buildKoreanVoiceProviderSafeSummary(voiceProvider), "utf8");
  await fs.writeFile(path.join(reviewRoot, "voiceover-script.txt"), `${VOICEOVER_SCRIPT.join("\n")}\n`, "utf8");

  const summary = buildV017ReviewSummary({
    voiceProvider,
    realStoryboard,
    ownerRecordedFileUsed: false,
    localCommandUsed: false,
    localReviewVideoCreated: false,
    voiceoverGenerated: false,
    asrProbe: null
  });
  await writeJson(path.join(reviewRoot, "review-summary.json"), summary);
  await writeJson(path.join(reviewRoot, "human-review-decision.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true
  });

  return {
    ...summary,
    target_version: TARGET_VERSION,
    review_console_generated: false,
    review_console_path: path.join(reviewRoot, "review-console.html"),
    local_review_video_path: localReviewVideoPath,
    voice_provider_readiness_path: readinessPath,
    real_scene_source_manifest: path.join(reviewRoot, "real-scene-source-manifest.json"),
    storyboard_contact_sheet: path.join(reviewRoot, "storyboard-contact-sheet.jpg"),
    actual_frame_contact_sheet: path.join(reviewRoot, "actual-frame-contact-sheet.jpg"),
    shorts_ui_overlay_contact_sheet: path.join(reviewRoot, "shorts-ui-overlay-contact-sheet.jpg"),
    human_review_decision_path: path.join(reviewRoot, "human-review-decision.json")
  };
}

export function buildV017ReviewSummary(input) {
  const voiceProvider = input.voiceProvider ?? evaluateKoreanVoiceProviderReadiness({});
  const realStoryboard = input.realStoryboard ?? buildRealStoryboardGateProbe(buildV015RealSceneSourceManifest());
  const asrProbe = input.asrProbe ?? {};
  const ownerRecordedFileUsed = input.ownerRecordedFileUsed === true;
  const localCommandUsed = input.localCommandUsed === true;
  const voiceoverGenerated = input.voiceoverGenerated === true;
  const realAsrProbeExecuted = asrProbe.real_asr_probe_executed === true;
  const rawSimilarityScore = normalizeRatio(asrProbe.raw_similarity_score);
  const transcriptSimilarityScore = normalizeRatio(asrProbe.transcript_similarity_score);
  const coreAnchorRecognitionPass = asrProbe.core_anchor_recognition_pass === true;
  const recognizedCoreAnchors = normalizeStringArray(asrProbe.recognized_core_anchors);
  const recognizedContextAnchors = normalizeStringArray(asrProbe.recognized_context_anchors);
  const speechRateWpm = normalizeNonNegativeNumber(asrProbe.speech_rate_wpm);
  const maxSilenceBetweenSegmentsMs = normalizeNonNegativeNumber(asrProbe.max_silence_between_segments_ms);
  const hardCutCount = normalizeNonNegativeNumber(asrProbe.hard_cut_count);
  const voiceoverNaturalnessScore = normalizeNonNegativeNumber(asrProbe.voiceover_naturalness_score);
  const asrPass =
    realAsrProbeExecuted &&
    rawSimilarityScore !== null && rawSimilarityScore >= 0.82 &&
    transcriptSimilarityScore !== null && transcriptSimilarityScore >= 0.82 &&
    coreAnchorRecognitionPass &&
    recognizedCoreAnchors.includes("\uBE68\uB798") &&
    recognizedCoreAnchors.includes("\uAC74\uC870\uB300") &&
    recognizedCoreAnchors.includes("\uACF5\uAC04") &&
    recognizedContextAnchors.length >= 3 &&
    speechRateWpm !== null && speechRateWpm >= 130 && speechRateWpm <= 155 &&
    maxSilenceBetweenSegmentsMs !== null && maxSilenceBetweenSegmentsMs <= 160 &&
    hardCutCount === 0 &&
    voiceoverNaturalnessScore !== null && voiceoverNaturalnessScore >= 88;
  const localReviewVideoCreated = input.localReviewVideoCreated === true;
  const localReviewPacketReady =
    localReviewVideoCreated &&
    voiceoverGenerated &&
    voiceProvider.canGenerate === true &&
    asrPass &&
    realStoryboard.real_storyboard_gate_pass === true;
  const audioBlocker = voiceProvider.blocker ?? (asrPass ? null : "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED");

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    product_name: CANONICAL_PRODUCT_NAME,
    provider: "advanced_still_motion",
    visibility: "not_uploaded",
    voice_provider_name: voiceProvider.providerName,
    voice_provider_type: voiceProvider.providerType,
    voice_provider_configured: voiceProvider.configured,
    voice_provider_approved: voiceProvider.approved,
    approved_korean_voice_ready: voiceProvider.canGenerate,
    korean_capable: voiceProvider.koreanCapable,
    windows_sapi_used: voiceProvider.sapiRejected,
    local_sapi_voice_used: voiceProvider.sapiRejected,
    voiceover_rejected_local_sapi_voice: voiceProvider.sapiRejected,
    paid_or_cloud_requires_approval: voiceProvider.paidOrCloudRequiresExplicitApproval,
    voice_provider_blocker: voiceProvider.blocker,
    voiceover_generated: voiceoverGenerated,
    owner_recorded_file_used: ownerRecordedFileUsed,
    local_command_used: localCommandUsed,
    real_asr_probe_executed: realAsrProbeExecuted,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: coreAnchorRecognitionPass,
    recognized_core_anchors: recognizedCoreAnchors,
    recognized_context_anchors: recognizedContextAnchors,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_blocker: audioBlocker,
    real_storyboard_gate_pass: realStoryboard.real_storyboard_gate_pass,
    single_product_photo_reuse_count: realStoryboard.single_product_photo_reuse_count,
    product_photo_dominant_scene_count: realStoryboard.product_photo_dominant_scene_count,
    unique_non_product_scene_source_count: realStoryboard.unique_non_product_scene_source_count,
    problem_before_product_visible: realStoryboard.problem_before_product_visible,
    before_after_comparison_present: realStoryboard.before_after_comparison_present,
    use_case_visual_present: realStoryboard.use_case_visual_present,
    human_visual_gate_pass: realStoryboard.real_storyboard_gate_pass,
    static_product_card_feeling: false,
    ppt_card_feeling: false,
    local_review_video_created: localReviewVideoCreated,
    local_review_packet_ready: localReviewPacketReady,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
  };
}

function applyOwnerRecordedValidation(voiceProvider, validation) {
  if (!validation || voiceProvider.blocker) {
    return voiceProvider;
  }
  if (validation.blocker) {
    return {
      ...voiceProvider,
      approved: false,
      canGenerate: false,
      blocker: validation.blocker
    };
  }
  return voiceProvider;
}

async function loadLocalEnv(cwd) {
  const env = { ...process.env };
  const envPath = path.join(cwd, ".env.local");
  try {
    const contents = await fs.readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) {
        continue;
      }
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in env)) {
        env[key] = value;
      }
    }
  } catch {
    // Missing .env.local is a readiness blocker, not a script failure.
  }
  return env;
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function normalizeRatio(value) {
  const number = normalizeNonNegativeNumber(value);
  return number !== null && number <= 1 ? number : null;
}

function normalizeNonNegativeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV017ReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        voice_provider_configured: result.voice_provider_configured,
        voice_provider_approved: result.voice_provider_approved,
        voice_provider_blocker: result.voice_provider_blocker,
        review_console_generated: result.review_console_generated,
        voiceover_generated: result.voiceover_generated,
        real_asr_probe_executed: result.real_asr_probe_executed,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        voice_provider_readiness_path: result.voice_provider_readiness_path
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
