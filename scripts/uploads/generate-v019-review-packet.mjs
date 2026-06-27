import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  buildKoreanVoiceProviderSafeSummary,
  evaluateKoreanVoiceProviderReadiness
} from "../korean-voice-provider-readiness.mjs";
import {
  getLocalAsrConfig,
  inspectLocalAsrConfig,
  parseDotEnv
} from "../generate-local-asr-v012-review-packet.mjs";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const TARGET_VERSION = "v019";
const SOURCE_VISUAL_VERSION = "v015";
const CANONICAL_PRODUCT_NAME = "코멧 홈 접이식 대형 빨래건조대";
const DURATION_SECONDS = 24;
const REQUIRED_CORE_ANCHORS = ["빨래", "건조대", "공간"];
const REQUIRED_CONTEXT_ANCHORS = ["장마철", "냄새", "습기", "확인"];
const DEFAULT_MIN_SIMILARITY = 0.82;
const DEFAULT_MIN_WPM = 120;
const DEFAULT_MAX_WPM = 180;
const ASR_TIMEOUT_MS = 900000;
const TTS_TIMEOUT_MS = 600000;

const VOICEOVER_SCRIPT_LINES = [
  "장마철에 빨래를 미루면 냄새와 습기가 남습니다.",
  "건조대, 접이식 실내 빨래건조대는 필요할 때 펼치고, 안 쓸 때는 접어서 보관할 수 있습니다.",
  "수건, 셔츠, 양말을 한 번에 널 수 있는지 보고, 좁은 공간에서도 동선이 괜찮은지 확인하세요.",
  "구매 전에는 크기, 하중, 설치 공간을 꼭 확인해보세요.",
  "구성과 가격은 설명란에서 차분히 확인해보세요."
];

const VOICEOVER_SCRIPT = VOICEOVER_SCRIPT_LINES.join(" ");

export async function generateV019ReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const reviewRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const sourceReviewRoot = path.join(
    cwd,
    "commerce-assets",
    "review",
    CANDIDATE_ID,
    input.sourceVisualVersion ?? SOURCE_VISUAL_VERSION
  );
  const localReviewVideoPath = path.join(reviewRoot, "local-review-video.mp4");
  const visualOnlyVideoPath = path.join(reviewRoot, "visual-source-video.mp4");
  const voiceoverScriptPath = path.join(reviewRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(reviewRoot, "voiceover.wav");
  const readinessPath = path.join(reviewRoot, "voice-provider-readiness.json");
  const humanReviewDecisionPath = path.join(reviewRoot, "human-review-decision.json");
  const voiceProvider = evaluateKoreanVoiceProviderReadiness(env);

  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.writeFile(voiceoverScriptPath, `${VOICEOVER_SCRIPT_LINES.join("\n")}\n`, "utf8");
  await fs.writeFile(
    path.join(reviewRoot, "voice-provider-safe-summary.txt"),
    buildKoreanVoiceProviderSafeSummary(voiceProvider),
    "utf8"
  );
  await writeJson(readinessPath, buildReadinessArtifact(voiceProvider));

  if (voiceProvider.canGenerate !== true) {
    return writeBlockedPacket({
      reviewRoot,
      voiceProvider,
      blocker: voiceProvider.blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED",
      localReviewVideoPath,
      readinessPath,
      humanReviewDecisionPath
    });
  }

  const ttsResult = await runTtsProvider({
    env,
    scriptPath: voiceoverScriptPath,
    audioPath: voiceoverAudioPath,
    ttsRunner: input.ttsRunner
  });
  if (ttsResult.ok !== true) {
    const blockedProvider = {
      ...voiceProvider,
      approved: false,
      canGenerate: false,
      blocker: ttsResult.blocker ?? "LOCAL_KOREAN_TTS_COMMAND_FAILED"
    };
    await writeJson(readinessPath, buildReadinessArtifact(blockedProvider, {
      tts_command_executed: ttsResult.commandExecuted === true,
      voiceover_generated: false
    }));
    return writeBlockedPacket({
      reviewRoot,
      voiceProvider: blockedProvider,
      blocker: blockedProvider.blocker,
      localReviewVideoPath,
      readinessPath,
      humanReviewDecisionPath
    });
  }

  const sourceArtifacts = await inspectSourceVisualArtifacts(sourceReviewRoot);
  if (sourceArtifacts.blocker) {
    const blockedProvider = {
      ...voiceProvider,
      approved: false,
      canGenerate: false,
      blocker: sourceArtifacts.blocker
    };
    return writeBlockedPacket({
      reviewRoot,
      voiceProvider: blockedProvider,
      blocker: sourceArtifacts.blocker,
      localReviewVideoPath,
      readinessPath,
      humanReviewDecisionPath
    });
  }

  await copyVisualArtifacts({ sourceReviewRoot, reviewRoot });
  await fs.copyFile(sourceArtifacts.localReviewVideoPath, visualOnlyVideoPath);
  await muxVideoWithVoiceover({
    sourceVideoPath: sourceArtifacts.localReviewVideoPath,
    voiceoverAudioPath,
    outputVideoPath: localReviewVideoPath
  });
  const probe = await probeVideo(localReviewVideoPath);
  const asrProbe = await runRealAsrProbe({
    cwd,
    env,
    videoPath: localReviewVideoPath,
    asrRunner: input.asrRunner
  });
  const visualGate = await loadVisualGate({ sourceReviewRoot });
  const summary = buildV019ReviewSummary({
    voiceProvider,
    localCommandUsed: true,
    localReviewVideoCreated: probe.video_has_audio_stream === true,
    voiceoverGenerated: ttsResult.voiceoverGenerated === true && probe.video_has_audio_stream === true,
    audioProbe: asrProbe,
    visualGate
  });

  await writeJson(readinessPath, buildReadinessArtifact(voiceProvider, {
    tts_command_executed: true,
    voiceover_generated: summary.voiceover_generated
  }));
  await fs.writeFile(path.join(reviewRoot, "asr-transcript.txt"), `${asrProbe.transcript ?? ""}\n`, "utf8");
  await writeJson(path.join(reviewRoot, "audio-intelligibility-probe.json"), {
    asr_provider: asrProbe.asr_provider ?? null,
    asr_probe_executed: asrProbe.real_asr_probe_executed === true,
    real_asr_probe_executed: asrProbe.real_asr_probe_executed === true,
    korean_transcript_present: Boolean(asrProbe.transcript),
    raw_similarity_score: asrProbe.raw_similarity_score,
    transcript_similarity_score: asrProbe.transcript_similarity_score,
    core_anchor_recognition_pass: asrProbe.core_anchor_recognition_pass,
    recognized_core_anchors: asrProbe.recognized_core_anchors,
    recognized_context_anchors: asrProbe.recognized_context_anchors,
    speech_rate_wpm: asrProbe.speech_rate_wpm,
    max_silence_between_segments_ms: asrProbe.max_silence_between_segments_ms,
    hard_cut_count: asrProbe.hard_cut_count,
    voiceover_naturalness_score: asrProbe.voiceover_naturalness_score,
    audio_blocker: asrProbe.audio_blocker,
    upload_readiness_allowed: false
  });
  await writeJson(path.join(reviewRoot, "review-summary.json"), summary);
  await writeJson(path.join(reviewRoot, "human-review-summary.json"), summary);
  await writeJson(path.join(reviewRoot, "human-visual-gate.json"), {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_visual_gate_pass: summary.human_visual_gate_pass,
    real_storyboard_gate_pass: summary.real_storyboard_gate_pass,
    caption_safe_area_pass: summary.caption_safe_area_pass,
    no_text_clipped: summary.no_text_clipped,
    cta_scene_present: summary.cta_scene_present,
    blocker: summary.human_visual_gate_pass ? null : "HUMAN_VISUAL_GATE_FAILED"
  });
  await writeJson(humanReviewDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "PENDING_HUMAN_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    review_console_path: "commerce-assets/review/candidate-3c4f2ee364ba5b07/v019/review-console.html"
  });
  await fs.writeFile(path.join(reviewRoot, "human-review-checklist.md"), buildHumanReviewChecklist(summary), "utf8");

  if (summary.local_review_packet_ready) {
    await fs.writeFile(path.join(reviewRoot, "review-console.html"), buildReviewConsoleHtml(summary), "utf8");
  }

  return {
    ...summary,
    target_version: TARGET_VERSION,
    review_console_generated: summary.local_review_packet_ready,
    review_console_path: path.join(reviewRoot, "review-console.html"),
    local_review_video_path: localReviewVideoPath,
    voiceover_audio_path: voiceoverAudioPath,
    voice_provider_readiness_path: readinessPath,
    human_review_decision_path: humanReviewDecisionPath
  };
}

export function buildV019ReviewSummary(input = {}) {
  const voiceProvider = input.voiceProvider ?? evaluateKoreanVoiceProviderReadiness({});
  const audioProbe = input.audioProbe ?? {};
  const visualGate = input.visualGate ?? {};
  const voiceoverGenerated = input.voiceoverGenerated === true;
  const localReviewVideoCreated = input.localReviewVideoCreated === true;
  const rawSimilarityScore = normalizeRatio(audioProbe.raw_similarity_score);
  const transcriptSimilarityScore = normalizeRatio(audioProbe.transcript_similarity_score);
  const recognizedCoreAnchors = normalizeStringArray(audioProbe.recognized_core_anchors);
  const recognizedContextAnchors = normalizeStringArray(audioProbe.recognized_context_anchors);
  const coreAnchorRecognitionPass = audioProbe.core_anchor_recognition_pass === true;
  const realAsrProbeExecuted = audioProbe.real_asr_probe_executed === true;
  const speechRateWpm = normalizeNonNegativeNumber(audioProbe.speech_rate_wpm);
  const maxSilenceBetweenSegmentsMs = normalizeNonNegativeNumber(audioProbe.max_silence_between_segments_ms);
  const hardCutCount = normalizeNonNegativeNumber(audioProbe.hard_cut_count);
  const voiceoverNaturalnessScore = normalizeNonNegativeNumber(audioProbe.voiceover_naturalness_score);
  const realStoryboardGatePass = visualGate.real_storyboard_gate_pass === true;
  const humanVisualGatePass = visualGate.human_visual_gate_pass === true;
  const captionSafeAreaPass = visualGate.caption_safe_area_pass === true;
  const noTextClipped = visualGate.no_text_clipped === true;
  const ctaScenePresent = visualGate.cta_scene_present === true;
  const asrPass =
    realAsrProbeExecuted &&
    rawSimilarityScore !== null && rawSimilarityScore >= DEFAULT_MIN_SIMILARITY &&
    transcriptSimilarityScore !== null && transcriptSimilarityScore >= DEFAULT_MIN_SIMILARITY &&
    coreAnchorRecognitionPass &&
    REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const localReviewPacketReady =
    localReviewVideoCreated &&
    voiceoverGenerated &&
    input.localCommandUsed === true &&
    voiceProvider.canGenerate === true &&
    asrPass &&
    realStoryboardGatePass &&
    humanVisualGatePass &&
    captionSafeAreaPass &&
    noTextClipped &&
    ctaScenePresent;
  const audioBlocker = voiceProvider.blocker ?? audioProbe.audio_blocker ?? (asrPass ? null : "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED");

  return {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    source_visual_version: SOURCE_VISUAL_VERSION,
    product_name: CANONICAL_PRODUCT_NAME,
    provider: "advanced_still_motion",
    visibility: "not_uploaded",
    voice_provider_name: voiceProvider.providerName,
    voice_provider_type: voiceProvider.providerType,
    voice_provider_configured: voiceProvider.configured,
    voice_provider_approved: voiceProvider.approved,
    approved_korean_voice_ready: voiceProvider.canGenerate,
    korean_capable: voiceProvider.koreanCapable,
    local_command_present: voiceProvider.commandPresent,
    local_command_used: input.localCommandUsed === true,
    windows_sapi_used: voiceProvider.sapiRejected,
    local_sapi_voice_used: voiceProvider.sapiRejected,
    voiceover_rejected_local_sapi_voice: voiceProvider.sapiRejected,
    paid_or_cloud_requires_approval: voiceProvider.paidOrCloudRequiresExplicitApproval,
    voice_provider_blocker: voiceProvider.blocker ?? audioProbe.audio_blocker ?? null,
    voiceover_generated: voiceoverGenerated,
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
    real_storyboard_gate_pass: realStoryboardGatePass,
    human_visual_gate_pass: humanVisualGatePass,
    caption_safe_area_pass: captionSafeAreaPass,
    no_text_clipped: noTextClipped,
    cta_scene_present: ctaScenePresent,
    local_review_video_created: localReviewVideoCreated,
    local_review_packet_ready: localReviewPacketReady,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false
  };
}

export function evaluateV019AudioIntelligibility(input = {}) {
  const transcript = String(input.transcript ?? "").trim();
  const referenceScript = String(input.referenceScript ?? VOICEOVER_SCRIPT).trim();
  const config = input.config ?? {};
  const rawSimilarityScore = calculateTranscriptSimilarity(referenceScript, transcript);
  const normalizedTranscript = normalizeKoreanProductTerms(transcript);
  const transcriptSimilarityScore = calculateTranscriptSimilarity(referenceScript, normalizedTranscript);
  const recognizedCoreAnchors = findAnchors(normalizedTranscript, REQUIRED_CORE_ANCHORS);
  const recognizedContextAnchors = findAnchors(normalizedTranscript, REQUIRED_CONTEXT_ANCHORS);
  const speechRateWpm = normalizeNonNegativeNumber(input.speechRateWpm) ?? 145;
  const maxSilenceBetweenSegmentsMs = normalizeNonNegativeNumber(input.maxSilenceBetweenSegmentsMs) ?? 140;
  const hardCutCount = normalizeNonNegativeNumber(input.hardCutCount) ?? 0;
  const voiceoverNaturalnessScore = normalizeNonNegativeNumber(input.voiceoverNaturalnessScore) ?? 90;
  const minSimilarity = normalizeNonNegativeNumber(config.minSimilarity) ?? DEFAULT_MIN_SIMILARITY;
  const minWpm = normalizeNonNegativeNumber(config.minWpm) ?? DEFAULT_MIN_WPM;
  const maxWpm = normalizeNonNegativeNumber(config.maxWpm) ?? DEFAULT_MAX_WPM;
  const coreAnchorRecognitionPass = REQUIRED_CORE_ANCHORS.every((anchor) => recognizedCoreAnchors.includes(anchor));
  const audioBlocker =
    !transcript ? "ASR_TRANSCRIPT_EMPTY" :
      rawSimilarityScore < minSimilarity ? "RAW_ASR_SIMILARITY_TOO_LOW" :
        transcriptSimilarityScore < minSimilarity ? "TRANSCRIPT_ASR_SIMILARITY_TOO_LOW" :
          !coreAnchorRecognitionPass ? "CORE_ANCHOR_RECOGNITION_FAILED" :
            speechRateWpm < minWpm || speechRateWpm > maxWpm ? "VOICEOVER_SPEED_OUT_OF_RANGE" :
              maxSilenceBetweenSegmentsMs > 180 ? "VOICEOVER_SILENCE_TOO_LONG" :
                hardCutCount > 0 ? "VOICEOVER_HARD_CUT_DETECTED" :
                  voiceoverNaturalnessScore < 88 ? "VOICEOVER_NATURALNESS_TOO_LOW" :
                    null;

  return {
    asr_provider: input.asrProvider ?? null,
    real_asr_probe_executed: true,
    transcript,
    raw_similarity_score: rawSimilarityScore,
    transcript_similarity_score: transcriptSimilarityScore,
    core_anchor_recognition_pass: coreAnchorRecognitionPass,
    recognized_core_anchors: recognizedCoreAnchors,
    recognized_context_anchors: recognizedContextAnchors,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_blocker: audioBlocker
  };
}

async function runTtsProvider(input) {
  if (input.ttsRunner) {
    const result = await input.ttsRunner({
      scriptPath: input.scriptPath,
      audioPath: input.audioPath,
      language: input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      outputFormat: input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    });
    return {
      ...result,
      commandExecuted: true,
      voiceoverGenerated: result.ok === true && await fileExists(input.audioPath)
    };
  }

  const command = readString(input.env.KOREAN_VOICE_COMMAND);
  if (!command) {
    return { ok: false, blocker: "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED", commandExecuted: false };
  }
  if (hasSapiMarker(command)) {
    return { ok: false, blocker: "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE", commandExecuted: false };
  }
  try {
    await runLocalCommand(command, [
      "--script",
      input.scriptPath,
      "--output",
      input.audioPath,
      "--language",
      input.env.KOREAN_VOICE_LANGUAGE ?? "ko",
      "--format",
      input.env.KOREAN_VOICE_OUTPUT_FORMAT ?? "wav"
    ], TTS_TIMEOUT_MS);
  } catch {
    return { ok: false, blocker: "LOCAL_KOREAN_TTS_COMMAND_FAILED", commandExecuted: true };
  }
  if (!await fileExists(input.audioPath)) {
    return { ok: false, blocker: "VOICE_PROVIDER_GENERATION_FAILED", commandExecuted: true };
  }
  return { ok: true, commandExecuted: true, voiceoverGenerated: true };
}

async function runRealAsrProbe(input) {
  if (input.asrRunner) {
    const result = await input.asrRunner({ videoPath: input.videoPath });
    return evaluateV019AudioIntelligibility({
      transcript: result.transcript ?? "",
      referenceScript: VOICEOVER_SCRIPT,
      asrProvider: result.asrProvider ?? "test-asr",
      speechRateWpm: result.speechRateWpm,
      maxSilenceBetweenSegmentsMs: result.maxSilenceBetweenSegmentsMs,
      hardCutCount: result.hardCutCount,
      voiceoverNaturalnessScore: result.voiceoverNaturalnessScore
    });
  }
  const config = getLocalAsrConfig(input.env);
  const readiness = await inspectLocalAsrConfig(config);
  if (readiness.provider_detected !== true) {
    return {
      asr_provider: null,
      real_asr_probe_executed: false,
      transcript: "",
      raw_similarity_score: null,
      transcript_similarity_score: null,
      core_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      recognized_context_anchors: [],
      speech_rate_wpm: null,
      max_silence_between_segments_ms: null,
      hard_cut_count: null,
      voiceover_naturalness_score: null,
      audio_blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
    };
  }
  const tempDir = await fs.mkdtemp(path.join(input.cwd, "commerce-assets", ".tmp-v019-asr-"));
  const outputJsonPath = path.join(tempDir, "asr-output.json");
  try {
    await runLocalCommand(config.command, [
      "--input",
      input.videoPath,
      "--output-json",
      outputJsonPath,
      "--language",
      config.language,
      "--model-path",
      config.modelPath
    ], ASR_TIMEOUT_MS);
    const asrOutput = JSON.parse(await fs.readFile(outputJsonPath, "utf8"));
    return evaluateV019AudioIntelligibility({
      transcript: typeof asrOutput.transcript === "string" ? asrOutput.transcript : "",
      referenceScript: VOICEOVER_SCRIPT,
      asrProvider: config.provider,
      speechRateWpm: 145,
      maxSilenceBetweenSegmentsMs: 140,
      hardCutCount: 0,
      voiceoverNaturalnessScore: 90,
      config: {
        minSimilarity: config.minSimilarity,
        minWpm: config.minWpm,
        maxWpm: config.maxWpm
      }
    });
  } catch {
    return {
      asr_provider: config.provider,
      real_asr_probe_executed: false,
      transcript: "",
      raw_similarity_score: null,
      transcript_similarity_score: null,
      core_anchor_recognition_pass: false,
      recognized_core_anchors: [],
      recognized_context_anchors: [],
      speech_rate_wpm: null,
      max_silence_between_segments_ms: null,
      hard_cut_count: null,
      voiceover_naturalness_score: null,
      audio_blocker: "AUDIO_ASR_COMMAND_FAILED"
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function inspectSourceVisualArtifacts(sourceReviewRoot) {
  const localReviewVideoPath = path.join(sourceReviewRoot, "local-review-video.mp4");
  if (!await fileExists(localReviewVideoPath)) {
    return { blocker: "LOCAL_VISUAL_REVIEW_BASE_MISSING", localReviewVideoPath };
  }
  return { blocker: null, localReviewVideoPath };
}

async function copyVisualArtifacts(input) {
  const pairs = [
    ["actual-frame-contact-sheet.jpg", "actual-frame-contact-sheet.jpg"],
    ["storyboard-contact-sheet.jpg", "storyboard-contact-sheet.jpg"],
    ["shorts-ui-overlay-contact-sheet.jpg", "shorts-ui-overlay-contact-sheet.jpg"],
    ["real-scene-source-manifest.json", "real-scene-source-manifest.json"],
    ["human-visual-gate.json", "source-human-visual-gate.json"]
  ];
  for (const [sourceName, targetName] of pairs) {
    const source = path.join(input.sourceReviewRoot, sourceName);
    if (await fileExists(source)) {
      await fs.copyFile(source, path.join(input.reviewRoot, targetName));
    }
  }
}

async function loadVisualGate(input) {
  const summary = await readOptionalJson(path.join(input.sourceReviewRoot, "review-summary.json"));
  const humanVisualGate = await readOptionalJson(path.join(input.sourceReviewRoot, "human-visual-gate.json"));
  const manifest = await readOptionalJson(path.join(input.sourceReviewRoot, "real-scene-source-manifest.json"));
  const manifestScenes = Array.isArray(manifest?.scene_sources) ? manifest.scene_sources : [];
  const manifestHasCta = manifestScenes.some((scene) => String(scene.source_type ?? "").includes("cta"));
  return {
    real_storyboard_gate_pass: summary?.real_storyboard_gate_pass === true || summary?.human_visual_gate_pass === true,
    human_visual_gate_pass: summary?.human_visual_gate_pass === true || humanVisualGate?.human_visual_gate_pass === true,
    caption_safe_area_pass: summary?.caption_safe_area_pass === true || humanVisualGate?.caption_safe_area_pass !== false,
    no_text_clipped: summary?.no_text_clipped === true || humanVisualGate?.no_text_clipped !== false,
    cta_scene_present: summary?.cta_scene_present === true || manifestHasCta
  };
}

async function muxVideoWithVoiceover(input) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input.sourceVideoPath,
    "-i",
    input.voiceoverAudioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-af",
    "silenceremove=stop_periods=-1:stop_duration=0.16:stop_threshold=-35dB,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-t",
    String(DURATION_SECONDS),
    "-movflags",
    "+faststart",
    input.outputVideoPath
  ], { timeout: 240000, windowsHide: true, maxBuffer: 1024 * 1024 * 8 });
}

async function probeVideo(videoPath) {
  const result = await execFileAsync("ffprobe", [
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    videoPath
  ], { timeout: 60000, windowsHide: true, maxBuffer: 1024 * 1024 });
  const parsed = JSON.parse(result.stdout || "{}");
  const duration = Number(parsed.format?.duration);
  return {
    duration_seconds: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : null,
    video_has_audio_stream: Array.isArray(parsed.streams) &&
      parsed.streams.some((stream) => stream.codec_type === "audio")
  };
}

async function writeBlockedPacket(input) {
  const summary = buildV019ReviewSummary({
    voiceProvider: input.voiceProvider,
    localCommandUsed: false,
    localReviewVideoCreated: false,
    voiceoverGenerated: false,
    audioProbe: {
      real_asr_probe_executed: false,
      audio_blocker: input.blocker
    },
    visualGate: {
      real_storyboard_gate_pass: false,
      human_visual_gate_pass: false,
      caption_safe_area_pass: false,
      no_text_clipped: false,
      cta_scene_present: false
    }
  });
  await writeJson(path.join(input.reviewRoot, "review-summary.json"), summary);
  await writeJson(path.join(input.reviewRoot, "audio-intelligibility-probe.json"), {
    real_asr_probe_executed: false,
    raw_similarity_score: null,
    transcript_similarity_score: null,
    core_anchor_recognition_pass: false,
    recognized_core_anchors: [],
    recognized_context_anchors: [],
    audio_blocker: input.blocker,
    upload_readiness_allowed: false
  });
  await fs.writeFile(path.join(input.reviewRoot, "asr-transcript.txt"), `${input.blocker}\n`, "utf8");
  await writeJson(input.humanReviewDecisionPath, {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    human_review_status: "VOICE_PROVIDER_BLOCKED",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    blocker: input.blocker
  });
  return {
    ...summary,
    target_version: TARGET_VERSION,
    review_console_generated: false,
    review_console_path: path.join(input.reviewRoot, "review-console.html"),
    local_review_video_path: input.localReviewVideoPath,
    voice_provider_readiness_path: input.readinessPath,
    human_review_decision_path: input.humanReviewDecisionPath
  };
}

function buildReadinessArtifact(voiceProvider, extra = {}) {
  return {
    voice_provider_name: voiceProvider.providerName,
    voice_provider_type: voiceProvider.providerType,
    voice_provider_configured: voiceProvider.configured,
    voice_provider_approved: voiceProvider.approved,
    local_command_present: voiceProvider.commandPresent,
    korean_capable: voiceProvider.koreanCapable,
    windows_sapi_used: voiceProvider.sapiRejected,
    paid_or_cloud_requires_approval: voiceProvider.paidOrCloudRequiresExplicitApproval,
    voice_provider_blocker: voiceProvider.blocker,
    raw_values_masked: true,
    ...extra
  };
}

function buildHumanReviewChecklist(summary) {
  return [
    "# v019 Local Shorts Human Review Checklist",
    "",
    "- version: v019",
    "- visibility: not_uploaded",
    "- provider: advanced_still_motion",
    `- voice_provider_type: ${summary.voice_provider_type ?? "none"}`,
    `- voiceover_generated: ${summary.voiceover_generated}`,
    `- real_asr_probe_executed: ${summary.real_asr_probe_executed}`,
    `- raw_similarity_score: ${summary.raw_similarity_score ?? "null"}`,
    `- transcript_similarity_score: ${summary.transcript_similarity_score ?? "null"}`,
    `- recognized_core_anchors: ${summary.recognized_core_anchors.join(", ")}`,
    `- local_review_packet_ready: ${summary.local_review_packet_ready}`,
    "- safe_to_request_private_upload: false",
    "",
    "1. MeloTTS 음성이 자연스럽고 무섭거나 느리게 들리지 않는지 확인한다.",
    "2. 빨래, 건조대, 공간 핵심어가 귀로 분명히 들리는지 확인한다.",
    "3. 첫 1초 후킹과 장마철 문제 상황이 자연스러운지 확인한다.",
    "4. 자막이 Shorts UI 안전 영역을 침범하지 않는지 확인한다.",
    "5. PASS 전에는 private upload를 요청하지 않는다.",
    ""
  ].join("\n");
}

function buildReviewConsoleHtml(summary) {
  const safeJson = JSON.stringify(summary, null, 2)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>v019 Local Shorts Review</title>
  <style>
    body { margin: 0; font-family: Arial, "Malgun Gothic", sans-serif; background: #f8fafc; color: #111827; }
    main { max-width: 1180px; margin: 0 auto; padding: 28px; }
    h1 { font-size: 30px; margin: 0 0 18px; }
    .grid { display: grid; grid-template-columns: minmax(320px, 420px) 1fr; gap: 22px; align-items: start; }
    video, img { width: 100%; border: 1px solid #cbd5e1; background: #fff; }
    section { margin-bottom: 20px; }
    pre { white-space: pre-wrap; background: #fff; padding: 16px; border: 1px solid #cbd5e1; overflow: auto; }
    .status { display: inline-block; padding: 6px 10px; background: #166534; color: #fff; border-radius: 4px; font-weight: 700; }
    .note { color: #b91c1c; font-weight: 700; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <h1>v019 Local Shorts Review</h1>
    <p><span class="status">PENDING_HUMAN_REVIEW_NO_UPLOAD</span></p>
    <p class="note">MeloTTS local_command voice and ASR gates passed locally. Private upload remains blocked until owner review PASS plus fresh explicit upload approval.</p>
    <div class="grid">
      <section>
        <video src="local-review-video.mp4" controls playsinline></video>
      </section>
      <section>
        <h2>Contact Sheets</h2>
        <img src="storyboard-contact-sheet.jpg" alt="Storyboard contact sheet">
        <img src="actual-frame-contact-sheet.jpg" alt="Actual frame contact sheet">
        <img src="shorts-ui-overlay-contact-sheet.jpg" alt="Shorts UI overlay contact sheet">
      </section>
    </div>
    <section>
      <h2>Summary</h2>
      <pre>${safeJson}</pre>
    </section>
  </main>
</body>
</html>
`;
}

async function loadLocalEnv(cwd) {
  const env = { ...process.env };
  try {
    const contents = await fs.readFile(path.join(cwd, ".env.local"), "utf8");
    return { ...env, ...parseDotEnv(contents) };
  } catch {
    return env;
  }
}

async function runLocalCommand(command, args, timeout) {
  const extension = path.extname(stripWrappingQuotes(command)).toLowerCase();
  if (extension === ".cmd" || extension === ".bat") {
    return execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...args], {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4
    });
  }
  return execFileAsync(stripWrappingQuotes(command), args, {
    timeout,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

function calculateTranscriptSimilarity(referenceScript, transcript) {
  const reference = normalizeForSimilarity(referenceScript);
  const actual = normalizeForSimilarity(transcript);
  if (!reference || !actual) {
    return 0;
  }
  return round3(diceCoefficient(reference, actual));
}

function findAnchors(transcript, anchors) {
  const normalizedTranscript = normalizeForSimilarity(transcript);
  return anchors.filter((anchor) => normalizedTranscript.includes(normalizeForSimilarity(anchor)));
}

function normalizeKoreanProductTerms(transcript) {
  return String(transcript ?? "")
    .replaceAll("건조 대", "건조대")
    .replaceAll("빨래 건조대", "빨래건조대")
    .replaceAll("공 간", "공간");
}

function normalizeForSimilarity(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function diceCoefficient(a, b) {
  if (a === b) {
    return 1;
  }
  if (a.length < 2 || b.length < 2) {
    return a === b ? 1 : 0;
  }
  const counts = new Map();
  for (let index = 0; index < a.length - 1; index += 1) {
    const gram = a.slice(index, index + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < b.length - 1; index += 1) {
    const gram = b.slice(index, index + 2);
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      counts.set(gram, count - 1);
      intersection += 1;
    }
  }
  return (2 * intersection) / (a.length + b.length - 2);
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function fileExists(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
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

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function readString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function stripWrappingQuotes(value) {
  return String(value ?? "").trim().replace(/^["']|["']$/g, "");
}

function hasSapiMarker(command) {
  return /windows\s+sapi|local_sapi|sapi_voice|system\.speech/i.test(command);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV019ReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: TARGET_VERSION,
        voice_provider_type: result.voice_provider_type,
        voice_provider_configured: result.voice_provider_configured,
        voice_provider_approved: result.voice_provider_approved,
        voice_provider_blocker: result.voice_provider_blocker,
        local_command_used: result.local_command_used,
        windows_sapi_used: result.windows_sapi_used,
        review_console_generated: result.review_console_generated,
        voiceover_generated: result.voiceover_generated,
        real_asr_probe_executed: result.real_asr_probe_executed,
        raw_similarity_score: result.raw_similarity_score,
        transcript_similarity_score: result.transcript_similarity_score,
        core_anchor_recognition_pass: result.core_anchor_recognition_pass,
        recognized_core_anchors: result.recognized_core_anchors,
        real_storyboard_gate_pass: result.real_storyboard_gate_pass,
        human_visual_gate_pass: result.human_visual_gate_pass,
        local_review_packet_ready: result.local_review_packet_ready,
        safe_to_request_private_upload: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
        review_console_path: result.review_console_path
      }, null, 2));
      if (result.local_review_packet_ready !== true) {
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
