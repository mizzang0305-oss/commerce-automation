import { analyzeYouTubeFixtureInputs } from "./engine";
import { buildYouTubeSourceSnapshot, normalizeTranscript } from "./source";
import { buildSyntheticYouTubeFixtures } from "./syntheticFixtures";
import type {
  TranscriptSegmentInput,
  YouTubeFixtureInput,
  YouTubeIntelligenceResult,
} from "./types";

export type YouTubeIntelligenceCommand = "fixture" | "analyze" | "report";

export interface YouTubeIntelligenceCommandOptions {
  command: YouTubeIntelligenceCommand;
  inputText?: string;
  runId: string;
  startedAt: string;
  finishedAt: string;
}

export function runYouTubeIntelligenceCommand(
  options: YouTubeIntelligenceCommandOptions,
): YouTubeIntelligenceResult | Record<string, unknown> {
  if (options.command === "report") {
    return buildSafeReport(parseResult(options.inputText));
  }

  const fixtures =
    options.command === "fixture"
      ? buildSyntheticYouTubeFixtures()
      : parseOwnerProvidedFixtures(options.inputText);

  return analyzeYouTubeFixtureInputs(fixtures, {
    runId: options.runId,
    startedAt: options.startedAt,
    finishedAt: options.finishedAt,
  });
}

function parseOwnerProvidedFixtures(value?: string): YouTubeFixtureInput[] {
  const root = parseObject(value, "YOUTUBE_INTELLIGENCE_INPUT_REQUIRED");
  const sources = root.sources;
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 100) {
    throw new Error("YOUTUBE_INTELLIGENCE_INPUT_SOURCES_INVALID");
  }

  return sources.map((entry) => {
    const source = requireObject(entry, "YOUTUBE_INTELLIGENCE_INPUT_SOURCE_INVALID");
    const segments = source.segments;
    if (!Array.isArray(segments)) {
      throw new Error("YOUTUBE_INTELLIGENCE_INPUT_SEGMENTS_INVALID");
    }
    const snapshot = buildYouTubeSourceSnapshot({
      sourceId: requireString(source.sourceId, "YOUTUBE_SOURCE_ID_INVALID"),
      url: requireString(source.url, "YOUTUBE_URL_MISSING"),
      title: requireString(source.title, "YOUTUBE_TITLE_INVALID"),
      channelId: requireString(source.channelId, "YOUTUBE_CHANNEL_ID_INVALID"),
      channelTitle: requireString(source.channelTitle, "YOUTUBE_CHANNEL_TITLE_INVALID"),
      observedAt: requireString(source.observedAt, "YOUTUBE_OBSERVED_AT_INVALID"),
      ...(typeof source.publishedAt === "string" ? { publishedAt: source.publishedAt } : {}),
      ...(typeof source.durationSeconds === "number"
        ? { durationSeconds: source.durationSeconds }
        : {}),
      transcriptAvailable: true,
      metadataAvailable: true,
      provenanceRepository: "owner_provided",
    });
    const normalizedSegments = segments.map<TranscriptSegmentInput>((segment) => {
      const item = requireObject(segment, "YOUTUBE_INTELLIGENCE_INPUT_SEGMENT_INVALID");
      return {
        startSeconds: requireNumber(item.startSeconds, "YOUTUBE_SEGMENT_START_INVALID"),
        ...(typeof item.durationSeconds === "number"
          ? { durationSeconds: item.durationSeconds }
          : {}),
        text: requireString(item.text, "YOUTUBE_SEGMENT_TEXT_INVALID"),
      };
    });
    return {
      snapshot,
      transcript: normalizeTranscript(snapshot, normalizedSegments),
    } satisfies YouTubeFixtureInput;
  });
}

function parseResult(value?: string): YouTubeIntelligenceResult {
  const parsed = parseObject(value, "YOUTUBE_INTELLIGENCE_REPORT_INPUT_REQUIRED");
  if (
    !Array.isArray(parsed.sources) ||
    !Array.isArray(parsed.evidence) ||
    !Array.isArray(parsed.patterns) ||
    typeof parsed.run !== "object" ||
    parsed.run === null
  ) {
    throw new Error("YOUTUBE_INTELLIGENCE_REPORT_INPUT_INVALID");
  }
  return parsed as unknown as YouTubeIntelligenceResult;
}

function buildSafeReport(result: YouTubeIntelligenceResult): Record<string, unknown> {
  return {
    analysisVersion: result.evidence[0]?.analysisVersion ?? null,
    sourceCount: result.sources.length,
    evidenceCount: result.evidence.length,
    patternCount: result.patterns.length,
    eligiblePatternCount: result.patterns.filter((item) => item.eligibleForTrendUse).length,
    hookFamilies: [...new Set(result.evidence.map((item) => item.hook.family))].sort(),
    distinctChannelCount: new Set(result.evidence.map((item) => item.channelId)).size,
    run: result.run,
    rawMediaReuseAllowed: false,
    researchOnly: true,
  };
}

function parseObject(value: string | undefined, code: string): Record<string, unknown> {
  if (!value) throw new Error(code);
  try {
    return requireObject(JSON.parse(value) as unknown, code);
  } catch (error) {
    if (error instanceof Error && error.message === code) throw error;
    throw new Error(code);
  }
}

function requireObject(value: unknown, code: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(code);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string") throw new Error(code);
  return value;
}

function requireNumber(value: unknown, code: string): number {
  if (typeof value !== "number") throw new Error(code);
  return value;
}
