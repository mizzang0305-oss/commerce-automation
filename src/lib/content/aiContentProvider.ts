import { validateContentGenerationSafety } from "@/lib/content/contentSafety";
import { generateTemplateContent } from "@/lib/content/templateContentProvider";
import type {
  ContentGenerationInput,
  ContentGenerationProvider,
  ContentGenerationProviderName,
  ContentGenerationResult
} from "@/lib/content/contentProviderTypes";
import { getAiProviderConfig } from "@/lib/server/aiProviderConfig";

class ScaffoldAiProvider implements ContentGenerationProvider {
  constructor(
    public readonly name: ContentGenerationProviderName,
    public readonly configured: boolean
  ) {}

  async generate(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    void input;
    throw new Error(`${this.name} content provider is scaffolded but external API calls are disabled in this PR.`);
  }
}

export async function generateContentWithProvider(input: ContentGenerationInput): Promise<ContentGenerationResult> {
  const config = getAiProviderConfig();
  const requestedProvider = config.provider;

  if (requestedProvider === "template" || requestedProvider === "disabled") {
    return withSafety(await generateTemplateContent(input), input);
  }

  const provider = new ScaffoldAiProvider(
    requestedProvider,
    requestedProvider === "openai" ? config.openaiConfigured : config.geminiConfigured
  );

  if (!provider.configured) {
    return fallbackToTemplate(input, requestedProvider, false, "AI provider key is not configured; template fallback was used.");
  }

  try {
    const aiResult = await provider.generate(input);
    const safety = validateContentGenerationSafety(aiResult, input);
    if (safety.blocked) {
      return fallbackToTemplate(input, requestedProvider, true, "AI draft did not pass safety checks; template fallback was used.", safety.warnings);
    }
    return {
      ...aiResult,
      safety_warnings: [...aiResult.safety_warnings, ...safety.warnings],
      safe_message: safety.safe_message
    };
  } catch {
    return fallbackToTemplate(input, requestedProvider, true, "AI provider is not enabled for live calls in this scaffold; template fallback was used.");
  }
}

async function fallbackToTemplate(
  input: ContentGenerationInput,
  requestedProvider: ContentGenerationProviderName,
  providerConfigured: boolean,
  safeMessage: string,
  warnings: string[] = []
) {
  const template = await generateTemplateContent(input);
  return withSafety(
    {
      ...template,
      requested_provider: requestedProvider,
      provider_configured: providerConfigured,
      used_fallback: true,
      safety_warnings: [...template.safety_warnings, ...warnings],
      safe_message: safeMessage
    },
    input
  );
}

function withSafety(result: ContentGenerationResult, input: ContentGenerationInput) {
  const safety = validateContentGenerationSafety(result, input);
  return {
    ...result,
    safety_warnings: Array.from(new Set([...result.safety_warnings, ...safety.warnings])),
    safe_message: safety.blocked ? safety.safe_message : result.safe_message
  };
}
