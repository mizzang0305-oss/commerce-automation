export const YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION = "youtube-creative-intelligence-v1" as const;

export type YouTubeSourceType = "youtube_public";

export interface YouTubeSourceProvenance {
  repository: "owner_provided" | "synthetic_fixture" | "future_public_provider";
  observedAt: string;
  sourceFingerprint: string;
  analysisVersion: typeof YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION;
}

export interface YouTubeSourceSnapshot {
  sourceId: string;
  videoId: string;
  canonicalUrl: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt?: string;
  durationSeconds?: number;
  observedAt: string;
  transcriptAvailable: boolean;
  metadataAvailable: boolean;
  sourceType: YouTubeSourceType;
  rawMediaReuseAllowed: false;
  provenance: YouTubeSourceProvenance;
}

export interface TranscriptSegmentInput {
  startSeconds: number;
  durationSeconds?: number;
  text: string;
}

export interface TranscriptSegment extends TranscriptSegmentInput {
  sourceId: string;
  videoId: string;
  sequence: number;
}

export interface YouTubeTranscript {
  sourceId: string;
  videoId: string;
  segments: TranscriptSegment[];
  transcriptFingerprint: string;
}

export type HookFamily =
  | "question"
  | "problem"
  | "warning"
  | "curiosity"
  | "number_list"
  | "before_after"
  | "benefit"
  | "demonstration"
  | "unknown";

export type ContentSection =
  | "HOOK"
  | "PROBLEM"
  | "CONTEXT"
  | "REVEAL"
  | "DEMONSTRATION"
  | "BENEFIT"
  | "PROOF"
  | "CTA";

export type ClaimType =
  | "problem"
  | "benefit"
  | "comparison"
  | "demonstration"
  | "proof"
  | "instruction"
  | "unknown";

export interface SourceTimeRef {
  startSeconds: number;
  endSeconds?: number;
}

export interface HookEvidence {
  family: HookFamily;
  text?: string;
  startSeconds?: number;
  endSeconds?: number;
  timingBucket: "first_1s" | "first_3s" | "first_5s" | "first_10s" | "after_10s" | "none";
  confidence: number;
}

export interface ContentStructureEvidence {
  section: ContentSection;
  confidence: number;
  sourceRefs: SourceTimeRef[];
}

export interface CtaEvidence {
  text: string;
  startSeconds: number;
  timing: "early" | "middle" | "late";
  confidence: number;
}

export interface VisionEvidence {
  pattern: string;
  sourceRef: SourceTimeRef;
  confidence: number;
  provider: "local_owner_frame";
  rawMediaReuseAllowed: false;
}

export interface CreativeEvidence {
  evidenceId: string;
  sourceId: string;
  videoId: string;
  channelId: string;
  observedAt: string;
  analysisVersion: typeof YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION;
  hook: HookEvidence;
  problemStatement?: string;
  reveal?: string;
  demonstration?: string;
  benefit?: string;
  cta?: CtaEvidence;
  structure: ContentStructureEvidence[];
  topicTags: string[];
  visualPatterns: string[];
  claimTypes: ClaimType[];
  captionDensityCharsPerSecond?: number;
  speechDensityWordsPerSecond?: number;
  scenePacing: "unknown" | "slow" | "medium" | "fast";
  confidence: number;
  rawMediaReuseAllowed: false;
  sourceRefs: SourceTimeRef[];
  provenance: YouTubeSourceProvenance;
}

export type CreativePatternType =
  | "hook_pattern"
  | "scene_pattern"
  | "cta_pattern"
  | "topic_pattern"
  | "pacing_pattern"
  | "caption_pattern";

export interface CreativePattern {
  patternId: string;
  type: CreativePatternType;
  value: string;
  sourceCount: number;
  channelCount: number;
  confidence: number;
  firstSeen: string;
  lastSeen: string;
  supportingVideoIds: string[];
  eligibleForTrendUse: boolean;
  minimumDistinctChannels: number;
  maxContributionPerChannel: number;
}

export interface YouTubePerformanceSnapshot {
  videoId: string;
  observedAt: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  source: "owner_provided" | "future_public_provider";
}

export interface YouTubeIntelligenceRun {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  inputVideoCount: number;
  normalizedVideoCount: number;
  duplicateCount: number;
  transcriptSuccessCount: number;
  transcriptFailureCount: number;
  metadataCalls: number;
  transcriptCalls: number;
  frameCount: number;
  modelCalls: number;
  visionCalls: number;
  patternCount: number;
  elapsedMs: number;
  safeErrorCount: number;
  safeErrors: string[];
}

export interface YouTubeFixtureInput {
  snapshot: YouTubeSourceSnapshot;
  transcript: YouTubeTranscript;
  visionEvidence?: VisionEvidence[];
}

export interface YouTubeIntelligenceResult {
  sources: YouTubeSourceSnapshot[];
  evidence: CreativeEvidence[];
  patterns: CreativePattern[];
  run: YouTubeIntelligenceRun;
}

export interface CoupangProductResearchShape {
  productId: string;
  category: string;
  useCases: string[];
  benefitTerms: string[];
}

export interface YouTubeCreativeResearchContext {
  productId: string;
  category: string;
  relevantHooks: HookFamily[];
  relevantStructures: ContentSection[][];
  ctaTimingSignals: Array<"early" | "middle" | "late">;
  topicSignals: string[];
  supportingVideoIds: string[];
  researchOnly: true;
  productionRankingMutationAllowed: false;
  rawMediaReuseAllowed: false;
}
