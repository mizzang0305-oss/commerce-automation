import "server-only";
import type { ContentGenerationProviderName } from "@/lib/content/contentProviderTypes";

export type AiProviderConfig = {
  provider: ContentGenerationProviderName;
  openaiConfigured: boolean;
  geminiConfigured: boolean;
  enabled: boolean;
};

export function getAiProviderConfig(): AiProviderConfig {
  const provider = normalizeProvider(process.env.CONTENT_AI_PROVIDER);
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim());
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  const enabled =
    (provider === "openai" && openaiConfigured) ||
    (provider === "gemini" && geminiConfigured);

  return {
    provider,
    openaiConfigured,
    geminiConfigured,
    enabled
  };
}

export function getAiProviderConfigStatus() {
  const config = getAiProviderConfig();
  return {
    provider: config.provider,
    openai_configured: config.openaiConfigured,
    gemini_configured: config.geminiConfigured,
    enabled: config.enabled
  };
}

function normalizeProvider(value: string | undefined): ContentGenerationProviderName {
  if (value === "openai" || value === "gemini" || value === "disabled") {
    return value;
  }
  return "template";
}
