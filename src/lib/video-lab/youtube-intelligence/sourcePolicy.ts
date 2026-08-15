import { canonicalizePublicYouTubeUrl } from "./source";

export type YouTubeIntelligenceSourceMode =
  | "synthetic_fixture"
  | "owner_provided_external_evidence"
  | "own_channel_authorized_api";

export const YOUTUBE_INTELLIGENCE_SOURCE_MODES: readonly YouTubeIntelligenceSourceMode[] = [
  "synthetic_fixture",
  "owner_provided_external_evidence",
  "own_channel_authorized_api",
] as const;

export const BLOCKED_YOUTUBE_INTELLIGENCE_SOURCE_MODES = [
  "automated_public_competitor_transcript",
  "automated_public_competitor_video",
  "automated_public_competitor_audio",
  "undocumented_youtube_api",
  "cookie_backed_scrape",
] as const;

export type BlockedYouTubeIntelligenceSourceMode = typeof BLOCKED_YOUTUBE_INTELLIGENCE_SOURCE_MODES[number];

export const EXACT_FIVE_OWNER_OBSERVATION_VIDEO_IDS = [
  "o5pWTuI-qvc",
  "NB07HjOa1nc",
  "SK3acCvnq1c",
  "TnrWoaTbhD8",
  "tDa7j2Ll8YM",
] as const;

export interface ExternalCreativeObservation {
  sourceUrl: string;
  videoId: string;
  observedBy: "owner";
  observedAt: string;
  hookFamily?: string;
  hookParaphrase?: string;
  hookStartSeconds?: number;
  structure: string[];
  ctaObserved?: boolean;
  ctaStartSeconds?: number;
  visualPatterns: string[];
  topicTags: string[];
  notes?: string;
  rawMediaReuseAllowed: false;
}

export interface OwnerObservationPacket {
  videoId: string;
  sourceUrl: string;
  sourceMode: "owner_provided_external_evidence";
  status: "OWNER_OBSERVATION_REQUIRED";
  rawMediaReuseAllowed: false;
}

export interface OwnChannelPerformanceSnapshot {
  videoId: string;
  observedAt: string;
  publishedAt?: string;
  views?: number;
  likes?: number;
  comments?: number;
  impressions?: number;
  clickThroughRate?: number;
  averageViewDuration?: number;
  averagePercentageViewed?: number;
  affiliateClicks?: number;
  conversions?: number;
  attributedRevenue?: number;
  source: "youtube_authorized" | "commerce_first_party";
}

export interface OwnChannelCommerceBinding {
  videoId: string;
  creativeId: string;
  productKey: string;
  publishedAt: string;
}

export interface SeparatedYouTubeIntelligenceEvidence {
  externalCreativeObservations: readonly ExternalCreativeObservation[];
  ownChannelPerformanceEvidence: readonly OwnChannelPerformanceSnapshot[];
  productionRankingImportAllowed: false;
}

export class YouTubeSourcePolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "YouTubeSourcePolicyError";
  }
}

export function assertYouTubeIntelligenceSourceMode(value: string): YouTubeIntelligenceSourceMode {
  if ((BLOCKED_YOUTUBE_INTELLIGENCE_SOURCE_MODES as readonly string[]).includes(value)) {
    throw new YouTubeSourcePolicyError(`YOUTUBE_SOURCE_MODE_BLOCKED:${value}`);
  }
  if (!(YOUTUBE_INTELLIGENCE_SOURCE_MODES as readonly string[]).includes(value)) {
    throw new YouTubeSourcePolicyError("YOUTUBE_SOURCE_MODE_NOT_ALLOWED");
  }
  return value as YouTubeIntelligenceSourceMode;
}

export function validateExternalCreativeObservation(input: ExternalCreativeObservation): ExternalCreativeObservation {
  assertYouTubeIntelligenceSourceMode("owner_provided_external_evidence");
  const source = canonicalizePublicYouTubeUrl(input.sourceUrl);
  if (source.videoId !== input.videoId) throw new YouTubeSourcePolicyError("EXTERNAL_OBSERVATION_VIDEO_BINDING_MISMATCH");
  if (input.observedBy !== "owner") throw new YouTubeSourcePolicyError("EXTERNAL_OBSERVATION_OWNER_REQUIRED");
  assertIsoTimestamp(input.observedAt, "EXTERNAL_OBSERVATION_TIMESTAMP_INVALID");
  if ((input as { rawMediaReuseAllowed?: unknown }).rawMediaReuseAllowed !== false) {
    throw new YouTubeSourcePolicyError("RAW_MEDIA_REUSE_FORBIDDEN");
  }
  if (!Array.isArray(input.structure) || !Array.isArray(input.visualPatterns) || !Array.isArray(input.topicTags)) {
    throw new YouTubeSourcePolicyError("EXTERNAL_OBSERVATION_STRUCTURE_INVALID");
  }
  for (const seconds of [input.hookStartSeconds, input.ctaStartSeconds]) {
    if (seconds !== undefined && (!Number.isFinite(seconds) || seconds < 0)) throw new YouTubeSourcePolicyError("EXTERNAL_OBSERVATION_TIMESTAMP_RANGE_INVALID");
  }
  return {
    ...input,
    sourceUrl: source.canonicalUrl,
    structure: cleanLabels(input.structure),
    visualPatterns: cleanLabels(input.visualPatterns),
    topicTags: cleanLabels(input.topicTags),
    rawMediaReuseAllowed: false,
  };
}

export function createExactFiveOwnerObservationPackets(): OwnerObservationPacket[] {
  return EXACT_FIVE_OWNER_OBSERVATION_VIDEO_IDS.map((videoId) => ({
    videoId,
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    sourceMode: "owner_provided_external_evidence",
    status: "OWNER_OBSERVATION_REQUIRED",
    rawMediaReuseAllowed: false,
  }));
}

export function validateOwnChannelPerformanceSnapshot(input: OwnChannelPerformanceSnapshot): OwnChannelPerformanceSnapshot {
  assertYouTubeIntelligenceSourceMode("own_channel_authorized_api");
  if (!/^[A-Za-z0-9_-]{11}$/u.test(input.videoId)) throw new YouTubeSourcePolicyError("OWN_CHANNEL_VIDEO_ID_INVALID");
  assertIsoTimestamp(input.observedAt, "OWN_CHANNEL_OBSERVED_AT_INVALID");
  if (input.publishedAt) assertIsoTimestamp(input.publishedAt, "OWN_CHANNEL_PUBLISHED_AT_INVALID");
  if (input.source !== "youtube_authorized" && input.source !== "commerce_first_party") throw new YouTubeSourcePolicyError("OWN_CHANNEL_PROVENANCE_INVALID");
  const youtubeFields: Array<keyof OwnChannelPerformanceSnapshot> = ["views", "likes", "comments", "impressions", "clickThroughRate", "averageViewDuration", "averagePercentageViewed"];
  const commerceFields: Array<keyof OwnChannelPerformanceSnapshot> = ["affiliateClicks", "conversions", "attributedRevenue"];
  const forbiddenFields = input.source === "youtube_authorized" ? commerceFields : youtubeFields;
  if (forbiddenFields.some((field) => input[field] !== undefined)) throw new YouTubeSourcePolicyError("OWN_CHANNEL_PROVENANCE_FIELD_MISMATCH");
  const values = Object.entries(input).filter(([key]) => !["videoId", "observedAt", "publishedAt", "source"].includes(key));
  if (values.some(([, value]) => typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    throw new YouTubeSourcePolicyError("OWN_CHANNEL_METRIC_INVALID");
  }
  return { ...input };
}

export function validateOwnChannelCommerceBinding(input: OwnChannelCommerceBinding): OwnChannelCommerceBinding {
  if (!/^[A-Za-z0-9_-]{11}$/u.test(input.videoId) || !input.creativeId.trim() || !input.productKey.trim()) {
    throw new YouTubeSourcePolicyError("OWN_CHANNEL_COMMERCE_BINDING_INVALID");
  }
  assertIsoTimestamp(input.publishedAt, "OWN_CHANNEL_COMMERCE_BINDING_INVALID");
  return { ...input };
}

export function createSeparatedYouTubeIntelligenceEvidence(input: {
  externalCreativeObservations?: readonly ExternalCreativeObservation[];
  ownChannelPerformanceEvidence?: readonly OwnChannelPerformanceSnapshot[];
} = {}): SeparatedYouTubeIntelligenceEvidence {
  return {
    externalCreativeObservations: (input.externalCreativeObservations ?? []).map(validateExternalCreativeObservation),
    ownChannelPerformanceEvidence: (input.ownChannelPerformanceEvidence ?? []).map(validateOwnChannelPerformanceSnapshot),
    productionRankingImportAllowed: false,
  };
}

export function buildBoundedExternalObservationPattern(observations: readonly ExternalCreativeObservation[]) {
  const validated = observations.map(validateExternalCreativeObservation);
  return {
    confidenceScope: "BOUNDED_EXTERNAL_OBSERVATION" as const,
    observationCount: validated.length,
    globalTrendClaimAllowed: false as const,
    rawMediaReuseAllowed: false as const,
  };
}

export interface OwnChannelAuthorizedPerformanceProvider {
  readonly enabled: false;
  readonly sourceMode: "own_channel_authorized_api";
  load(): Promise<never>;
}

export class DisabledOwnChannelAuthorizedPerformanceProvider implements OwnChannelAuthorizedPerformanceProvider {
  readonly enabled = false as const;
  readonly sourceMode = "own_channel_authorized_api" as const;

  async load(): Promise<never> {
    throw new YouTubeSourcePolicyError("YOUTUBE_OWN_CHANNEL_AUTHORIZATION_DISABLED");
  }
}

function assertIsoTimestamp(value: string, code: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new YouTubeSourcePolicyError(code);
  }
}

function cleanLabels(values: readonly string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
