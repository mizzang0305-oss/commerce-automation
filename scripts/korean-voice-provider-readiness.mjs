import fs from "node:fs/promises";
import path from "node:path";

const ALLOWED_PROVIDER_TYPES = new Set(["local_command", "approved_cloud", "owner_recorded"]);
const OWNER_RECORDED_EXTENSIONS = new Set([".wav", ".mp3", ".m4a"]);

export function evaluateKoreanVoiceProviderReadiness(env = {}) {
  const providerName = readString(env.KOREAN_VOICE_PROVIDER);
  const providerType = inferProviderType(providerName);
  const commandPresent = Boolean(readString(env.KOREAN_VOICE_COMMAND));
  const sourcePathPresent = Boolean(readString(env.KOREAN_VOICE_SOURCE_PATH));
  const modelPathPresent = Boolean(readString(env.KOREAN_VOICE_MODEL_PATH));
  const outputFormat = readString(env.KOREAN_VOICE_OUTPUT_FORMAT) ?? "wav";
  const language = readString(env.KOREAN_VOICE_LANGUAGE) ?? "";
  const providerApprovedFlag = readBool(env.KOREAN_VOICE_PROVIDER_APPROVED);
  const rejectWindowsSapi = readBool(env.KOREAN_VOICE_REJECT_WINDOWS_SAPI, true);
  const paidOrCloudApproval = readBool(env.KOREAN_VOICE_PAID_OR_CLOUD_APPROVAL);
  const sapiRejected = rejectWindowsSapi && hasSapiMarker(providerName, env.KOREAN_VOICE_COMMAND);
  const koreanCapable = language.toLowerCase().startsWith("ko");
  const configured = isConfigured({ providerName, providerType, commandPresent, sourcePathPresent, modelPathPresent });
  const paidOrCloudRequiresExplicitApproval = providerType === "approved_cloud" && !paidOrCloudApproval;
  const blocker = resolveBlocker({
    providerName,
    configured,
    providerApprovedFlag,
    koreanCapable,
    sapiRejected,
    paidOrCloudRequiresExplicitApproval
  });
  const approved = blocker === null;

  return {
    providerName,
    providerType,
    configured,
    approved,
    koreanCapable,
    sapiRejected,
    paidOrCloudRequiresExplicitApproval,
    canGenerate: approved,
    blocker,
    commandPresent,
    sourcePathPresent,
    modelPathPresent,
    outputFormat,
    languagePresent: Boolean(language),
    rawValuesMasked: true
  };
}

export function buildKoreanVoiceProviderSafeSummary(readiness) {
  return JSON.stringify({
    providerName: readiness.providerName,
    providerType: readiness.providerType,
    configured: readiness.configured,
    approved: readiness.approved,
    koreanCapable: readiness.koreanCapable,
    sapiRejected: readiness.sapiRejected,
    paidOrCloudRequiresExplicitApproval: readiness.paidOrCloudRequiresExplicitApproval,
    canGenerate: readiness.canGenerate,
    blocker: readiness.blocker,
    commandPresent: readiness.commandPresent,
    sourcePathPresent: readiness.sourcePathPresent,
    modelPathPresent: readiness.modelPathPresent,
    outputFormat: readiness.outputFormat,
    languagePresent: readiness.languagePresent,
    rawValuesMasked: true
  }, null, 2);
}

function resolveBlocker(input) {
  if (!input.providerName || !input.configured) {
    return "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED";
  }
  if (input.sapiRejected) {
    return "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE";
  }
  if (!input.providerApprovedFlag) {
    return "VOICE_PROVIDER_NOT_APPROVED";
  }
  if (!input.koreanCapable) {
    return "KOREAN_VOICE_PROVIDER_NOT_KOREAN_CAPABLE";
  }
  if (input.paidOrCloudRequiresExplicitApproval) {
    return "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL";
  }
  return null;
}

export async function validateOwnerRecordedVoiceFile(sourcePath) {
  const extension = path.extname(readString(sourcePath) ?? "").toLowerCase();
  const extensionValid = OWNER_RECORDED_EXTENSIONS.has(extension);
  if (!extensionValid) {
    return {
      filePresent: await fileExists(sourcePath),
      fileValid: false,
      extensionValid: false,
      durationSeconds: null,
      hasAudioStream: false,
      blocker: "OWNER_RECORDED_VOICE_FILE_INVALID",
      rawPathMasked: true
    };
  }
  try {
    const stat = await fs.stat(sourcePath);
    const fileValid = stat.isFile() && stat.size > 44;
    return {
      filePresent: stat.isFile(),
      fileValid,
      extensionValid,
      durationSeconds: null,
      hasAudioStream: fileValid,
      blocker: fileValid ? null : "OWNER_RECORDED_VOICE_FILE_INVALID",
      rawPathMasked: true
    };
  } catch {
    return {
      filePresent: false,
      fileValid: false,
      extensionValid,
      durationSeconds: null,
      hasAudioStream: false,
      blocker: "OWNER_RECORDED_VOICE_FILE_NOT_FOUND",
      rawPathMasked: true
    };
  }
}

function isConfigured(input) {
  if (!input.providerName || !input.providerType || !ALLOWED_PROVIDER_TYPES.has(input.providerType)) {
    return false;
  }
  if (input.providerType === "local_command") {
    return input.commandPresent;
  }
  if (input.providerType === "owner_recorded") {
    return input.sourcePathPresent || input.modelPathPresent;
  }
  return true;
}

async function fileExists(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

function inferProviderType(providerName) {
  const value = providerName?.toLowerCase();
  if (!value) {
    return null;
  }
  if (value.includes("owner")) {
    return "owner_recorded";
  }
  if (value.includes("cloud") || value.includes("api") || value.includes("eleven") || value.includes("openai")) {
    return "approved_cloud";
  }
  return "local_command";
}

function hasSapiMarker(providerName, command) {
  const combined = `${providerName ?? ""} ${readString(command) ?? ""}`.toLowerCase();
  return combined.includes("windows sapi") ||
    combined.includes("local_sapi") ||
    combined.includes("sapi_voice") ||
    combined.includes("system.speech");
}

function readString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBool(value, defaultValue = false) {
  if (typeof value !== "string") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "n"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}
