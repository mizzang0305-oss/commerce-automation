import { sha256 } from "./source";
import type {
  CreativeEvidence,
  CreativePattern,
  CreativePatternType,
} from "./types";

export interface PatternAggregationOptions {
  maxContributionPerChannel?: number;
  minimumDistinctChannels?: number;
}

interface PatternContribution {
  type: CreativePatternType;
  value: string;
  videoId: string;
  channelId: string;
  observedAt: string;
  confidence: number;
}

export function aggregateCreativePatterns(
  evidence: readonly CreativeEvidence[],
  options: PatternAggregationOptions = {},
): CreativePattern[] {
  const maxContributionPerChannel = options.maxContributionPerChannel ?? 2;
  const minimumDistinctChannels = options.minimumDistinctChannels ?? 2;
  if (!Number.isInteger(maxContributionPerChannel) || maxContributionPerChannel < 1) {
    throw new Error("YOUTUBE_PATTERN_CHANNEL_CAP_INVALID");
  }
  if (!Number.isInteger(minimumDistinctChannels) || minimumDistinctChannels < 1) {
    throw new Error("YOUTUBE_PATTERN_MINIMUM_CHANNELS_INVALID");
  }

  const dedupedEvidence = [...new Map(evidence.map((item) => [item.videoId, item])).values()];
  const contributions = dedupedEvidence.flatMap(toContributions);
  const groups = new Map<string, PatternContribution[]>();
  for (const contribution of contributions) {
    const key = `${contribution.type}\u0000${contribution.value}`;
    groups.set(key, [...(groups.get(key) ?? []), contribution]);
  }

  return [...groups.values()]
    .map((group) =>
      buildPattern(group, {
        maxContributionPerChannel,
        minimumDistinctChannels,
      }),
    )
    .sort((left, right) =>
      left.type.localeCompare(right.type) ||
      right.confidence - left.confidence ||
      left.value.localeCompare(right.value),
    );
}

function toContributions(evidence: CreativeEvidence): PatternContribution[] {
  const common = {
    videoId: evidence.videoId,
    channelId: evidence.channelId,
    observedAt: evidence.observedAt,
    confidence: evidence.confidence,
  };
  const items: Array<Pick<PatternContribution, "type" | "value">> = [
    { type: "hook_pattern", value: evidence.hook.family },
    { type: "pacing_pattern", value: evidence.scenePacing },
    { type: "caption_pattern", value: captionBucket(evidence.captionDensityCharsPerSecond) },
    ...evidence.topicTags.map((value) => ({ type: "topic_pattern" as const, value })),
    ...evidence.visualPatterns.map((value) => ({ type: "scene_pattern" as const, value })),
    ...(evidence.cta
      ? [{ type: "cta_pattern" as const, value: evidence.cta.timing }]
      : []),
  ];
  return items.map((item) => ({ ...item, ...common }));
}

function buildPattern(
  group: readonly PatternContribution[],
  options: Required<PatternAggregationOptions>,
): CreativePattern {
  const byChannel = new Map<string, PatternContribution[]>();
  for (const contribution of group) {
    byChannel.set(contribution.channelId, [
      ...(byChannel.get(contribution.channelId) ?? []),
      contribution,
    ]);
  }

  const capped = [...byChannel.values()].flatMap((items) =>
    items
      .sort(
        (left, right) =>
          right.confidence - left.confidence || left.videoId.localeCompare(right.videoId),
      )
      .slice(0, options.maxContributionPerChannel),
  );
  const channelCount = new Set(capped.map((item) => item.channelId)).size;
  const diversityFactor = Math.min(channelCount / options.minimumDistinctChannels, 1);
  const averageConfidence =
    capped.reduce((sum, item) => sum + item.confidence, 0) / Math.max(capped.length, 1);
  const [first] = group;
  const dates = capped.map((item) => item.observedAt).sort();

  return {
    patternId: `ytcp:${sha256(`${first!.type}:${first!.value}`).slice(0, 20)}`,
    type: first!.type,
    value: first!.value,
    sourceCount: capped.length,
    channelCount,
    confidence: round(averageConfidence * diversityFactor),
    firstSeen: dates[0]!,
    lastSeen: dates[dates.length - 1]!,
    supportingVideoIds: [...new Set(capped.map((item) => item.videoId))].sort(),
    eligibleForTrendUse: channelCount >= options.minimumDistinctChannels,
    minimumDistinctChannels: options.minimumDistinctChannels,
    maxContributionPerChannel: options.maxContributionPerChannel,
  };
}

function captionBucket(value?: number): string {
  if (value === undefined) return "unknown";
  if (value < 3) return "low";
  if (value < 7) return "medium";
  return "high";
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
