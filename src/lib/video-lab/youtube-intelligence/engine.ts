import { aggregateCreativePatterns, type PatternAggregationOptions } from "./aggregation";
import { analyzeCreativeEvidence } from "./analyzer";
import { assertSyntheticFixtureOnly, type YouTubeIntelligenceFlags } from "./config";
import { assertSourceBinding } from "./source";
import type {
  YouTubeFixtureInput,
  YouTubeIntelligenceResult,
  YouTubeIntelligenceRun,
} from "./types";

export interface AnalyzeYouTubeFixtureInputsOptions {
  runId: string;
  startedAt: string;
  finishedAt: string;
  flags?: Readonly<YouTubeIntelligenceFlags>;
  patternOptions?: PatternAggregationOptions;
}

export function analyzeYouTubeFixtureInputs(
  inputs: readonly YouTubeFixtureInput[],
  options: AnalyzeYouTubeFixtureInputsOptions,
): YouTubeIntelligenceResult {
  assertSyntheticFixtureOnly(options.flags);
  assertTimestamp(options.startedAt, "YOUTUBE_RUN_STARTED_AT_INVALID");
  assertTimestamp(options.finishedAt, "YOUTUBE_RUN_FINISHED_AT_INVALID");

  const sources = [];
  const evidence = [];
  const safeErrors: string[] = [];
  const seenVideoIds = new Set<string>();
  let duplicateCount = 0;
  let transcriptSuccessCount = 0;
  let transcriptFailureCount = 0;

  for (const input of inputs) {
    if (seenVideoIds.has(input.snapshot.videoId)) {
      duplicateCount += 1;
      continue;
    }
    seenVideoIds.add(input.snapshot.videoId);

    try {
      assertSourceBinding(input.snapshot, input.transcript);
      sources.push(input.snapshot);
      evidence.push(analyzeCreativeEvidence(input));
      transcriptSuccessCount += 1;
    } catch (error) {
      transcriptFailureCount += 1;
      safeErrors.push(toSafeError(error));
    }
  }

  const patterns = aggregateCreativePatterns(evidence, options.patternOptions);
  const run: YouTubeIntelligenceRun = {
    runId: options.runId,
    startedAt: options.startedAt,
    finishedAt: options.finishedAt,
    inputVideoCount: inputs.length,
    normalizedVideoCount: sources.length,
    duplicateCount,
    transcriptSuccessCount,
    transcriptFailureCount,
    metadataCalls: 0,
    transcriptCalls: 0,
    frameCount: inputs.reduce((sum, input) => sum + (input.visionEvidence?.length ?? 0), 0),
    modelCalls: 0,
    visionCalls: 0,
    patternCount: patterns.length,
    elapsedMs: Math.max(0, Date.parse(options.finishedAt) - Date.parse(options.startedAt)),
    safeErrorCount: safeErrors.length,
    safeErrors,
  };

  return { sources, evidence, patterns, run };
}

function toSafeError(error: unknown): string {
  if (error instanceof Error && /^[A-Z0-9_:.-]+$/.test(error.message)) {
    return error.message.slice(0, 160);
  }
  return "YOUTUBE_INTELLIGENCE_SAFE_ANALYSIS_ERROR";
}

function assertTimestamp(value: string, code: string): void {
  if (!value || Number.isNaN(Date.parse(value))) throw new Error(code);
}
