import fs from "node:fs/promises";
import path from "node:path";

export type V035KoreanVoiceProviderReadiness = {
  provider_type: "local_command" | "blocked";
  v035_melotts_provider_ready: boolean;
  local_command_provider_ready: boolean;
  command_present: boolean;
  provider_approved: boolean;
  korean_language_ready: boolean;
  windows_sapi_used: boolean;
  paid_or_cloud_provider_used: boolean;
  raw_values_masked: true;
  blocker: string | null;
};

export async function loadV035KoreanVoiceEnv(cwd = process.cwd(), overrides: Partial<NodeJS.ProcessEnv> = {}) {
  return {
    ...process.env,
    ...(await loadLocalEnv(cwd)),
    ...overrides
  };
}

export function evaluateV035KoreanVoiceProviderReadiness(env: NodeJS.ProcessEnv = process.env): V035KoreanVoiceProviderReadiness {
  const provider = readString(env.KOREAN_VOICE_PROVIDER);
  const command = readString(env.KOREAN_VOICE_COMMAND);
  const language = readString(env.KOREAN_VOICE_LANGUAGE) ?? "ko";
  const providerApproved = readBool(env.KOREAN_VOICE_PROVIDER_APPROVED);
  const commandPresent = Boolean(command);
  const paidOrCloudProviderUsed = hasPaidOrCloudMarker(provider, command);
  const windowsSapiUsed = hasSapiMarker(provider, command);
  const localCommandProviderReady =
    provider === "local_command" &&
    commandPresent &&
    providerApproved &&
    language.toLowerCase().startsWith("ko") &&
    !windowsSapiUsed &&
    !paidOrCloudProviderUsed;
  const blocker =
    !provider || provider !== "local_command" || !commandPresent
      ? "BLOCKED_KOREAN_VOICE_PROVIDER_NOT_CONFIGURED"
      : windowsSapiUsed
        ? "VOICEOVER_REJECTED_LOCAL_SAPI_VOICE"
        : paidOrCloudProviderUsed
          ? "VOICE_PROVIDER_PAID_OR_CLOUD_REQUIRES_APPROVAL"
          : !providerApproved
            ? "VOICE_PROVIDER_NOT_APPROVED"
            : !language.toLowerCase().startsWith("ko")
              ? "KOREAN_VOICE_PROVIDER_NOT_KOREAN_CAPABLE"
              : null;

  return {
    provider_type: localCommandProviderReady ? "local_command" : "blocked",
    v035_melotts_provider_ready: localCommandProviderReady,
    local_command_provider_ready: localCommandProviderReady,
    command_present: commandPresent,
    provider_approved: providerApproved,
    korean_language_ready: language.toLowerCase().startsWith("ko"),
    windows_sapi_used: windowsSapiUsed,
    paid_or_cloud_provider_used: paidOrCloudProviderUsed,
    raw_values_masked: true,
    blocker
  };
}

async function loadLocalEnv(cwd: string) {
  const env: Record<string, string> = {};
  const envPath = path.join(cwd, ".env.local");
  try {
    const contents = await fs.readFile(envPath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex < 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
      if (key && !(key in env)) {
        env[key] = value;
      }
    }
  } catch {
    // Missing .env.local is represented by readiness booleans, not raw config output.
  }
  return env;
}

function hasSapiMarker(...values: Array<string | null>) {
  const combined = values.filter(Boolean).join(" ").toLowerCase();
  return combined.includes("windows sapi") ||
    combined.includes("local_sapi") ||
    combined.includes("sapi_voice") ||
    combined.includes("system.speech");
}

function hasPaidOrCloudMarker(...values: Array<string | null>) {
  const combined = values.filter(Boolean).join(" ").toLowerCase();
  return combined.includes("openai") ||
    combined.includes("elevenlabs") ||
    combined.includes("eleven_labs") ||
    combined.includes("naver") ||
    combined.includes("google") ||
    combined.includes("azure") ||
    combined.includes("cloud") ||
    combined.includes("api");
}

function readString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readBool(value: unknown) {
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "y"].includes(value.trim().toLowerCase());
}
