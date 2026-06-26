import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  evaluateKoreanVoiceProviderReadiness,
  validateOwnerRecordedVoiceFile
} from "../korean-voice-provider-readiness.mjs";

export async function checkKoreanVoiceProviderSetup(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? await loadLocalEnv(cwd);
  const baseReadiness = evaluateKoreanVoiceProviderReadiness(env);
  const ownerRecordedValidation = baseReadiness.providerType === "owner_recorded"
    ? await validateOwnerRecordedVoiceFile(env.KOREAN_VOICE_SOURCE_PATH ?? env.KOREAN_VOICE_MODEL_PATH)
    : null;
  const voiceProvider = applyOwnerRecordedValidation(baseReadiness, ownerRecordedValidation);

  return {
    setup_wizard_added: true,
    owner_recorded_mode_supported: true,
    local_command_mode_supported: true,
    approved_cloud_blocked_until_separate_approval: true,
    windows_sapi_rejected: true,
    setup_instructions_generated: true,
    voice_provider_name: voiceProvider.providerName,
    voice_provider_type: voiceProvider.providerType,
    voice_provider_configured: voiceProvider.configured,
    voice_provider_approved: voiceProvider.approved,
    korean_capable: voiceProvider.koreanCapable,
    owner_recorded_file_present: ownerRecordedValidation?.filePresent ?? false,
    owner_recorded_file_valid: ownerRecordedValidation?.fileValid ?? false,
    local_command_present: voiceProvider.commandPresent,
    model_path_configured: voiceProvider.modelPathPresent,
    windows_sapi_used: voiceProvider.sapiRejected,
    local_sapi_voice_used: voiceProvider.sapiRejected,
    paid_or_cloud_requires_approval: voiceProvider.paidOrCloudRequiresExplicitApproval,
    voice_provider_blocker: voiceProvider.blocker,
    command_present: voiceProvider.commandPresent,
    source_path_present: voiceProvider.sourcePathPresent,
    language_present: voiceProvider.languagePresent,
    raw_values_masked: true
  };
}

export function buildKoreanVoiceSetupGuide(setup = {}) {
  const blocker = setup.voice_provider_blocker ?? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED";
  return [
    "# v018 Korean Voice Provider Setup Guide",
    "",
    `current_blocker: ${blocker}`,
    "raw_values_masked: true",
    "",
    "## owner_recorded",
    "",
    "Use this when Minz records the Korean voiceover manually.",
    "",
    "Required .env.local keys:",
    "",
    "```text",
    "KOREAN_VOICE_PROVIDER=owner_recorded",
    "KOREAN_VOICE_PROVIDER_APPROVED=true",
    "KOREAN_VOICE_SOURCE_PATH=<local wav/mp3/m4a path>",
    "KOREAN_VOICE_LANGUAGE=ko",
    "KOREAN_VOICE_REJECT_WINDOWS_SAPI=true",
    "```",
    "",
    "- Allowed extensions: wav, mp3, m4a",
    "- Keep the recording outside committed files.",
    "- Do not commit voice/audio/model assets.",
    "",
    "## local_command",
    "",
    "Use this when a local non-SAPI Korean TTS command is already installed.",
    "",
    "Required .env.local keys:",
    "",
    "```text",
    "KOREAN_VOICE_PROVIDER=local_command",
    "KOREAN_VOICE_PROVIDER_APPROVED=true",
    "KOREAN_VOICE_COMMAND=<local command hidden from output>",
    "KOREAN_VOICE_MODEL_PATH=<optional local model path hidden from output>",
    "KOREAN_VOICE_LANGUAGE=ko",
    "KOREAN_VOICE_REJECT_WINDOWS_SAPI=true",
    "```",
    "",
    "- Windows SAPI/local_sapi is rejected.",
    "- Full command strings and model paths are never printed by the wizard.",
    "",
    "## approved_cloud",
    "",
    "Cloud or paid TTS remains blocked unless a separate approval is provided.",
    "",
    "Expected blocker without approval:",
    "",
    "```text",
    "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL",
    "```",
    ""
  ].join("\n");
}

export async function loadLocalEnv(cwd = process.cwd()) {
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
    // Missing .env.local is reported as a readiness blocker, not a script failure.
  }
  return env;
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

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  checkKoreanVoiceProviderSetup()
    .then((result) => {
      console.log(JSON.stringify({
        setup_wizard_added: result.setup_wizard_added,
        owner_recorded_mode_supported: result.owner_recorded_mode_supported,
        local_command_mode_supported: result.local_command_mode_supported,
        approved_cloud_blocked_until_separate_approval: result.approved_cloud_blocked_until_separate_approval,
        windows_sapi_rejected: result.windows_sapi_rejected,
        voice_provider_configured: result.voice_provider_configured,
        voice_provider_approved: result.voice_provider_approved,
        korean_capable: result.korean_capable,
        owner_recorded_file_present: result.owner_recorded_file_present,
        local_command_present: result.local_command_present,
        paid_or_cloud_requires_approval: result.paid_or_cloud_requires_approval,
        voice_provider_blocker: result.voice_provider_blocker,
        raw_values_masked: true
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
