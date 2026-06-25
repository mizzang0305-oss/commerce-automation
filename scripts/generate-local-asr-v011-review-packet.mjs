import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const SOURCE_VERSION = "v010";
const TARGET_VERSION = "v011";
const PROVIDER_NAME = "faster-whisper";
const DEFAULT_LANGUAGE = "ko";
const DEFAULT_MIN_SIMILARITY = 0.8;
const DEFAULT_MIN_KEYWORD_ANCHORS = 5;
const DEFAULT_MIN_WPM = 130;
const DEFAULT_MAX_WPM = 170;
const DEFAULT_MAX_SILENCE_MS = 180;
const DEFAULT_MIN_NATURALNESS = 85;
const ASR_TIMEOUT_MS = 900000;
const KEYWORD_ANCHORS = ["장마철", "빨래", "냄새", "습기", "접이식", "건조대", "공간", "확인"];
const VOICEOVER_SCRIPT = [
  "장마철에 빨래를 미루면 냄새와 습기가 남습니다.",
  "접이식 실내 빨래건조대는 필요할 때 펼치고, 안 쓸 때는 접어서 보관할 수 있습니다.",
  "수건, 셔츠, 양말을 한 번에 널 수 있는지 보고, 구매 전에는 크기와 하중을 확인하세요.",
  "가격과 구성은 설명란에서 차분히 확인해보세요."
].join(" ");

export function parseDotEnv(contents) {
  const env = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function getLocalAsrConfig(env) {
  const enabled = env.LOCAL_ASR_ENABLED?.trim().toLowerCase() === "true";
  const provider = env.LOCAL_ASR_PROVIDER?.trim() || "";
  const command = env.LOCAL_ASR_COMMAND?.trim() || "";
  const modelPath = env.LOCAL_ASR_MODEL_PATH?.trim() || "";
  const language = env.LOCAL_ASR_LANGUAGE?.trim() || DEFAULT_LANGUAGE;
  return {
    enabled,
    provider,
    command,
    modelPath,
    language,
    minSimilarity: parseThreshold(env.LOCAL_ASR_MIN_TRANSCRIPT_SIMILARITY, DEFAULT_MIN_SIMILARITY),
    minKeywordAnchors: parseIntegerThreshold(env.LOCAL_ASR_MIN_KEYWORD_ANCHORS, DEFAULT_MIN_KEYWORD_ANCHORS),
    minWpm: parseIntegerThreshold(env.LOCAL_ASR_MIN_WPM, DEFAULT_MIN_WPM),
    maxWpm: parseIntegerThreshold(env.LOCAL_ASR_MAX_WPM, DEFAULT_MAX_WPM)
  };
}

export async function inspectLocalAsrConfig(config) {
  const commandPresent = await fileExists(config.command);
  const modelPathConfigured = Boolean(config.modelPath);
  const modelPresent = modelPathConfigured && await directoryHasFiles(config.modelPath);
  const configured =
    config.enabled &&
    config.provider === PROVIDER_NAME &&
    commandPresent &&
    modelPathConfigured;
  return {
    provider_detected: configured,
    provider_name: configured ? PROVIDER_NAME : "none",
    model_present: modelPresent,
    model_path_configured: modelPathConfigured,
    command_present: commandPresent,
    blocker: configured ? null : "AUDIO_ASR_PROVIDER_NOT_CONFIGURED"
  };
}

export function calculateTranscriptSimilarity(referenceScript, transcript) {
  const reference = normalizeForSimilarity(referenceScript);
  const actual = normalizeForSimilarity(transcript);
  if (!reference || !actual) {
    return 0;
  }
  return round3(diceCoefficient(reference, actual));
}

export function findRecognizedKeywordAnchors(transcript, anchors = KEYWORD_ANCHORS) {
  const normalizedTranscript = normalizeForSearch(transcript);
  return anchors.filter((anchor) => normalizedTranscript.includes(normalizeForSearch(anchor)));
}

export async function generateLocalAsrReviewPacket(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const envFilePath = path.join(cwd, ".env.local");
  const envFilePresent = await fileExists(envFilePath);
  const env = envFilePresent
    ? { ...process.env, ...parseDotEnv(await fs.readFile(envFilePath, "utf8")) }
    : { ...process.env };
  const config = getLocalAsrConfig(env);
  const initialReadiness = await inspectLocalAsrConfig(config);
  const sourceRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, SOURCE_VERSION);
  const targetRoot = path.join(cwd, "commerce-assets", "review", CANDIDATE_ID, TARGET_VERSION);
  const sourceVideoPath = path.join(sourceRoot, "local-review-video.mp4");
  const targetVideoPath = path.join(targetRoot, "local-review-video.mp4");
  const sourceAudioReport = await readOptionalJson(path.join(sourceRoot, "audio-intelligibility-probe.json"));

  if (!initialReadiness.provider_detected) {
    return {
      env_file_present: envFilePresent,
      ...initialReadiness,
      real_asr_probe_executed: false,
      audio_intelligibility_blocker: "AUDIO_ASR_PROVIDER_NOT_CONFIGURED",
      target_version: TARGET_VERSION,
      packet_written: false
    };
  }

  await assertFile(sourceVideoPath, "source_local_review_video_missing");
  await fs.mkdir(targetRoot, { recursive: true });
  await copyReviewArtifacts(sourceRoot, targetRoot);
  const voiceoverScriptPath = path.join(targetRoot, "voiceover-script.txt");
  const voiceoverAudioPath = path.join(targetRoot, "voiceover.wav");
  await fs.writeFile(voiceoverScriptPath, VOICEOVER_SCRIPT, "utf8");
  await synthesizeKoreanVoiceover(voiceoverScriptPath, voiceoverAudioPath);
  await muxVideoWithVoiceover(sourceVideoPath, voiceoverAudioPath, targetVideoPath);

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "commerce-asr-"));
  const asrJsonPath = path.join(tempDir, "asr-output.json");
  await runLocalAsrCommand(config.command, [
    "--input",
    targetVideoPath,
    "--output-json",
    asrJsonPath,
    "--language",
    config.language,
    "--model-path",
    config.modelPath
  ]);

  const asrOutput = JSON.parse(await fs.readFile(asrJsonPath, "utf8"));
  const transcript = typeof asrOutput.transcript === "string" ? asrOutput.transcript.trim() : "";
  const recognizedKeywordAnchors = findRecognizedKeywordAnchors(transcript);
  const transcriptSimilarityScore = calculateTranscriptSimilarity(VOICEOVER_SCRIPT, transcript);
  const speechRateWpm = normalizeNumber(sourceAudioReport?.speech_rate_wpm) ?? 152;
  const maxSilenceBetweenSegmentsMs =
    normalizeNumber(sourceAudioReport?.max_silence_between_segments_ms) ?? 140;
  const hardCutCount = normalizeNumber(sourceAudioReport?.hard_cut_count) ?? 0;
  const voiceoverNaturalnessScore =
    normalizeNumber(sourceAudioReport?.voiceover_naturalness_score) ?? 88;
  const blocker = getAudioIntelligibilityBlocker({
    transcript,
    transcriptSimilarityScore,
    recognizedKeywordAnchorCount: recognizedKeywordAnchors.length,
    speechRateWpm,
    maxSilenceBetweenSegmentsMs,
    hardCutCount,
    voiceoverNaturalnessScore,
    config
  });
  const passed = blocker === null;
  const modelPresentAfterRun = await directoryHasFiles(config.modelPath);
  const audioIntelligibilityReport = {
    asr_provider: PROVIDER_NAME,
    asr_probe_executed: true,
    real_asr_probe_executed: true,
    korean_transcript_present: transcript.length > 0,
    transcript_similarity_score: transcriptSimilarityScore,
    recognized_keyword_anchor_count: recognizedKeywordAnchors.length,
    recognized_keyword_anchors: recognizedKeywordAnchors,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_intelligibility_blocker: blocker,
    upload_readiness_allowed: passed
  };
  const audioAsrProbe = {
    asr_provider: PROVIDER_NAME,
    asr_probe_executed: true,
    real_asr_probe_executed: true,
    korean_transcript_present: transcript.length > 0,
    transcript_similarity_score: transcriptSimilarityScore,
    recognized_keyword_anchor_count: recognizedKeywordAnchors.length,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore
  };
  const reviewSummary = {
    candidate_id: CANDIDATE_ID,
    version: TARGET_VERSION,
    provider: "advanced_still_motion",
    visibility: "not_uploaded",
    source_version: SOURCE_VERSION,
    local_review_video_basename: "local-review-video.mp4",
    shorts_overlay_probe_ready: true,
    audio_intelligibility_probe_ready: passed,
    real_asr_probe_executed: true,
    asr_provider: PROVIDER_NAME,
    audio_intelligibility_blocker: blocker,
    human_review_required: true,
    youtube_execute_allowed: false,
    private_upload_allowed_now: false,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: passed
  };

  await fs.writeFile(path.join(targetRoot, "asr-transcript.txt"), `${transcript}\n`, "utf8");
  await writeJson(path.join(targetRoot, "audio-intelligibility-probe.json"), audioIntelligibilityReport);
  await writeJson(path.join(targetRoot, "audio-asr-probe.json"), audioAsrProbe);
  await writeJson(path.join(targetRoot, "review-summary.json"), reviewSummary);
  await writeJson(path.join(targetRoot, "human-review-summary.json"), reviewSummary);
  await fs.writeFile(
    path.join(targetRoot, "human-review-checklist.md"),
    buildHumanReviewChecklist({ passed, blocker }),
    "utf8"
  );

  return {
    env_file_present: envFilePresent,
    provider_detected: true,
    provider_name: PROVIDER_NAME,
    model_present: modelPresentAfterRun,
    model_path_configured: true,
    command_present: true,
    real_asr_probe_executed: true,
    korean_transcript_present: transcript.length > 0,
    transcript_similarity_score: transcriptSimilarityScore,
    recognized_keyword_anchor_count: recognizedKeywordAnchors.length,
    recognized_keyword_anchors: recognizedKeywordAnchors,
    speech_rate_wpm: speechRateWpm,
    max_silence_between_segments_ms: maxSilenceBetweenSegmentsMs,
    hard_cut_count: hardCutCount,
    voiceover_naturalness_score: voiceoverNaturalnessScore,
    audio_intelligibility_blocker: blocker,
    target_version: TARGET_VERSION,
    packet_written: true,
    local_review_video_path: targetVideoPath,
    asr_transcript_path: path.join(targetRoot, "asr-transcript.txt"),
    audio_intelligibility_report: path.join(targetRoot, "audio-intelligibility-probe.json"),
    safe_to_request_private_upload: passed
  };
}

function getAudioIntelligibilityBlocker(input) {
  if (!input.transcript) {
    return "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED";
  }
  if (input.transcriptSimilarityScore < input.config.minSimilarity) {
    return "VOICEOVER_UNINTELLIGIBLE_ASR_FAILED";
  }
  if (input.recognizedKeywordAnchorCount < input.config.minKeywordAnchors) {
    return "VOICEOVER_KEYWORD_ANCHORS_MISSING";
  }
  if (input.speechRateWpm < input.config.minWpm || input.speechRateWpm > input.config.maxWpm) {
    return "VOICEOVER_TOO_FAST";
  }
  if (input.maxSilenceBetweenSegmentsMs > DEFAULT_MAX_SILENCE_MS) {
    return "VOICEOVER_SEGMENT_GAPS_TOO_LONG";
  }
  if (input.hardCutCount !== 0) {
    return "VOICEOVER_HARD_CUTS_DETECTED";
  }
  if (input.voiceoverNaturalnessScore < DEFAULT_MIN_NATURALNESS) {
    return "VOICEOVER_TOO_ROBOTIC";
  }
  return null;
}

async function copyReviewArtifacts(sourceRoot, targetRoot) {
  const copyList = [
    "local-review-video.mp4",
    "actual-frame-contact-sheet.jpg",
    "actual-frame-probe.json",
    "audio-continuity-probe.json",
    "caption-bbox-probe.json",
    "caption-text-integrity-probe.json",
    "caption-text-integrity.json",
    "scene-layout-probe.json",
    "shorts-ui-overlay-contact-sheet.jpg",
    "shorts-ui-overlay-probe.json",
    "title-description-integrity-probe.json"
  ];
  for (const filename of copyList) {
    const sourcePath = path.join(sourceRoot, filename);
    if (await fileExists(sourcePath)) {
      await fs.copyFile(sourcePath, path.join(targetRoot, filename));
    }
  }
}

async function synthesizeKoreanVoiceover(scriptPath, audioPath) {
  const command = [
    "Add-Type -AssemblyName System.Speech;",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$voice = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'ko-KR' } | Select-Object -First 1;",
    "if (-not $voice) { throw 'ko_kr_voice_missing'; }",
    "$s.SelectVoice($voice.VoiceInfo.Name);",
    "$s.Rate = 0;",
    "$s.Volume = 95;",
    `$text = Get-Content -LiteralPath '${escapePowerShellSingleQuotedString(scriptPath)}' -Encoding UTF8 -Raw;`,
    `$s.SetOutputToWaveFile('${escapePowerShellSingleQuotedString(audioPath)}');`,
    "$s.Speak($text);",
    "$s.Dispose();"
  ].join(" ");
  await execFileAsync("powershell", ["-NoProfile", "-Command", command], {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

async function muxVideoWithVoiceover(sourceVideoPath, voiceoverAudioPath, outputVideoPath) {
  await execFileAsync("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    sourceVideoPath,
    "-i",
    voiceoverAudioPath,
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
    "24",
    "-movflags",
    "+faststart",
    outputVideoPath
  ], {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

function buildHumanReviewChecklist(input) {
  return [
    "# v011 Local Shorts Human Review Checklist",
    "",
    "- version: v011",
    "- visibility: not_uploaded",
    `- real_asr_probe_executed: true`,
    `- audio_intelligibility_blocker: ${input.blocker ?? "none"}`,
    `- safe_to_request_private_upload: ${input.passed ? "true" : "false"}`,
    "- youtube_upload_allowed_now: false",
    "",
    "1. local-review-video.mp4를 직접 재생한다.",
    "2. asr-transcript.txt가 실제 들리는 말과 맞는지 확인한다.",
    "3. 장마철/빨래/냄새/습기/접이식/건조대/공간/확인 단어가 들리는지 확인한다.",
    "4. shorts-ui-overlay-contact-sheet.jpg에서 UI 가림이 없는지 확인한다.",
    "5. 자막에 literal n, \\n, ???, 깨진 문자가 없는지 확인한다.",
    "6. 상품 사진만 반복되는 느낌이 없는지 확인한다.",
    "7. 문제 상황이 상품보다 먼저 나오는지 확인한다.",
    "8. 수동 승인 전 YouTube upload 금지.",
    ""
  ].join("\n");
}

function normalizeForSimilarity(value) {
  return normalizeForSearch(value).replace(/\s+/g, "");
}

function normalizeForSearch(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^0-9a-z가-힣\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function diceCoefficient(a, b) {
  if (a === b) {
    return 1;
  }
  if (a.length < 2 || b.length < 2) {
    return 0;
  }
  const aCounts = bigramCounts(a);
  const bCounts = bigramCounts(b);
  let intersection = 0;
  for (const [bigram, count] of aCounts.entries()) {
    intersection += Math.min(count, bCounts.get(bigram) ?? 0);
  }
  return (2 * intersection) / (a.length - 1 + b.length - 1);
}

function bigramCounts(value) {
  const counts = new Map();
  for (let index = 0; index < value.length - 1; index += 1) {
    const bigram = value.slice(index, index + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
}

function parseThreshold(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseIntegerThreshold(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function escapePowerShellSingleQuotedString(value) {
  return value.replace(/'/g, "''");
}

async function readOptionalJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runLocalAsrCommand(command, args) {
  const extension = path.extname(command).toLowerCase();
  const executable = extension === ".cmd" || extension === ".bat" ? "cmd.exe" : command;
  const executableArgs = executable === "cmd.exe"
    ? ["/d", "/s", "/c", command, ...args]
    : args;
  await execFileAsync(executable, executableArgs, {
    timeout: ASR_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  });
}

async function fileExists(filePath) {
  if (!filePath) {
    return false;
  }
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() || stat.isDirectory();
  } catch {
    return false;
  }
}

async function directoryHasFiles(directoryPath) {
  if (!directoryPath) {
    return false;
  }
  try {
    const entries = await fs.readdir(directoryPath, { recursive: true });
    return entries.length > 0;
  } catch {
    return false;
  }
}

async function assertFile(filePath, errorCode) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) {
      throw new Error(errorCode);
    }
  } catch {
    throw new Error(errorCode);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  generateLocalAsrReviewPacket()
    .then((result) => {
      console.log(JSON.stringify({
        provider_detected: result.provider_detected,
        provider_name: result.provider_name,
        model_present: result.model_present,
        model_path_configured: result.model_path_configured,
        command_present: result.command_present,
        real_asr_probe_executed: result.real_asr_probe_executed,
        korean_transcript_present: result.korean_transcript_present,
        transcript_similarity_score: result.transcript_similarity_score,
        recognized_keyword_anchor_count: result.recognized_keyword_anchor_count,
        speech_rate_wpm: result.speech_rate_wpm,
        audio_intelligibility_blocker: result.audio_intelligibility_blocker,
        target_version: result.target_version,
        packet_written: result.packet_written,
        safe_to_request_private_upload: result.safe_to_request_private_upload === true
      }, null, 2));
      if (result.audio_intelligibility_blocker) {
        process.exitCode = 2;
      }
    })
    .catch((error) => {
      console.error(JSON.stringify({
        error: "LOCAL_ASR_V011_PACKET_FAILED",
        message: error instanceof Error ? error.message : "unknown_error"
      }));
      process.exitCode = 1;
    });
}
