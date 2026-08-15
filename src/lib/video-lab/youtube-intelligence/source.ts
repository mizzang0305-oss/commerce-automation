import { createHash } from "node:crypto";

import {
  YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION,
  type TranscriptSegment,
  type TranscriptSegmentInput,
  type YouTubeSourceProvenance,
  type YouTubeSourceSnapshot,
  type YouTubeTranscript,
} from "./types";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const APPROVED_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"]);
const MAX_SEGMENT_TEXT_LENGTH = 2_000;
const MAX_SEGMENTS = 20_000;

export class YouTubeSourceValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "YouTubeSourceValidationError";
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function canonicalizePublicYouTubeUrl(value: string): {
  canonicalUrl: string;
  videoId: string;
} {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new YouTubeSourceValidationError("YOUTUBE_URL_MISSING");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new YouTubeSourceValidationError("YOUTUBE_URL_INVALID");
  }

  if (parsed.protocol !== "https:") {
    throw new YouTubeSourceValidationError("YOUTUBE_URL_HTTPS_REQUIRED");
  }
  if (parsed.username || parsed.password) {
    throw new YouTubeSourceValidationError("YOUTUBE_URL_CREDENTIALS_FORBIDDEN");
  }

  const host = parsed.hostname.toLowerCase();
  if (!APPROVED_HOSTS.has(host)) {
    throw new YouTubeSourceValidationError("YOUTUBE_URL_HOST_REJECTED");
  }

  let videoId: string | null = null;
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    videoId = pathParts.length === 1 ? pathParts[0] ?? null : null;
  } else if (parsed.pathname === "/watch") {
    videoId = parsed.searchParams.get("v");
  } else {
    if (
      pathParts.length === 2 &&
      ["shorts", "embed", "v"].includes(pathParts[0] ?? "")
    ) {
      videoId = pathParts[1] ?? null;
    }
  }

  if (!videoId || !VIDEO_ID_PATTERN.test(videoId)) {
    throw new YouTubeSourceValidationError("YOUTUBE_VIDEO_ID_INVALID");
  }

  return {
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    videoId,
  };
}

export interface BuildYouTubeSourceSnapshotInput {
  sourceId: string;
  url: string;
  title: string;
  channelId: string;
  channelTitle: string;
  observedAt: string;
  publishedAt?: string;
  durationSeconds?: number;
  transcriptAvailable: boolean;
  metadataAvailable: boolean;
  provenanceRepository: YouTubeSourceProvenance["repository"];
}

export function buildYouTubeSourceSnapshot(
  input: BuildYouTubeSourceSnapshotInput,
): YouTubeSourceSnapshot {
  const { canonicalUrl, videoId } = canonicalizePublicYouTubeUrl(input.url);
  assertIsoTimestamp(input.observedAt, "YOUTUBE_OBSERVED_AT_INVALID");
  if (input.publishedAt) {
    assertIsoTimestamp(input.publishedAt, "YOUTUBE_PUBLISHED_AT_INVALID");
  }
  if (
    input.durationSeconds !== undefined &&
    (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0)
  ) {
    throw new YouTubeSourceValidationError("YOUTUBE_DURATION_INVALID");
  }

  const sourceId = requireBoundedText(input.sourceId, 128, "YOUTUBE_SOURCE_ID_INVALID");
  const title = requireBoundedText(input.title, 500, "YOUTUBE_TITLE_INVALID");
  const channelId = requireBoundedText(input.channelId, 128, "YOUTUBE_CHANNEL_ID_INVALID");
  const channelTitle = requireBoundedText(
    input.channelTitle,
    300,
    "YOUTUBE_CHANNEL_TITLE_INVALID",
  );

  const fingerprintInput = JSON.stringify({
    sourceId,
    videoId,
    canonicalUrl,
    title,
    channelId,
    channelTitle,
    observedAt: input.observedAt,
  });

  return {
    sourceId,
    videoId,
    canonicalUrl,
    title,
    channelId,
    channelTitle,
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
    ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
    observedAt: input.observedAt,
    transcriptAvailable: input.transcriptAvailable,
    metadataAvailable: input.metadataAvailable,
    sourceType: "youtube_public",
    rawMediaReuseAllowed: false,
    provenance: {
      repository: input.provenanceRepository,
      observedAt: input.observedAt,
      sourceFingerprint: sha256(fingerprintInput),
      analysisVersion: YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION,
    },
  };
}

export function normalizeTranscript(
  snapshot: YouTubeSourceSnapshot,
  inputs: readonly TranscriptSegmentInput[],
): YouTubeTranscript {
  if (inputs.length > MAX_SEGMENTS) {
    throw new YouTubeSourceValidationError("YOUTUBE_TRANSCRIPT_SEGMENT_LIMIT_EXCEEDED");
  }

  const normalized = inputs
    .map((segment, inputIndex) => normalizeSegment(segment, inputIndex))
    .filter((segment): segment is TranscriptSegmentInput & { inputIndex: number } => Boolean(segment))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.inputIndex - right.inputIndex)
    .map<TranscriptSegment>((segment, sequence) => ({
      sourceId: snapshot.sourceId,
      videoId: snapshot.videoId,
      sequence,
      startSeconds: segment.startSeconds,
      ...(segment.durationSeconds !== undefined
        ? { durationSeconds: segment.durationSeconds }
        : {}),
      text: segment.text,
    }));

  const transcriptFingerprint = sha256(
    JSON.stringify(
      normalized.map(({ startSeconds, durationSeconds, text }) => ({
        startSeconds,
        durationSeconds,
        text,
      })),
    ),
  );

  return {
    sourceId: snapshot.sourceId,
    videoId: snapshot.videoId,
    segments: normalized,
    transcriptFingerprint,
  };
}

export function assertSourceBinding(
  snapshot: YouTubeSourceSnapshot,
  transcript: YouTubeTranscript,
): void {
  if (snapshot.sourceId !== transcript.sourceId || snapshot.videoId !== transcript.videoId) {
    throw new YouTubeSourceValidationError("YOUTUBE_SOURCE_BINDING_MISMATCH");
  }
  for (const [index, segment] of transcript.segments.entries()) {
    if (
      segment.sourceId !== snapshot.sourceId ||
      segment.videoId !== snapshot.videoId ||
      segment.sequence !== index
    ) {
      throw new YouTubeSourceValidationError("YOUTUBE_SEGMENT_BINDING_MISMATCH");
    }
    if (index > 0 && transcript.segments[index - 1]!.startSeconds > segment.startSeconds) {
      throw new YouTubeSourceValidationError("YOUTUBE_TRANSCRIPT_NOT_MONOTONIC");
    }
  }
}

function normalizeSegment(
  segment: TranscriptSegmentInput,
  inputIndex: number,
): (TranscriptSegmentInput & { inputIndex: number }) | null {
  if (!Number.isFinite(segment.startSeconds) || segment.startSeconds < 0) {
    throw new YouTubeSourceValidationError("YOUTUBE_SEGMENT_START_INVALID");
  }
  if (
    segment.durationSeconds !== undefined &&
    (!Number.isFinite(segment.durationSeconds) || segment.durationSeconds < 0)
  ) {
    throw new YouTubeSourceValidationError("YOUTUBE_SEGMENT_DURATION_INVALID");
  }
  const text = segment.text.trim();
  if (!text) return null;
  if (text.length > MAX_SEGMENT_TEXT_LENGTH) {
    throw new YouTubeSourceValidationError("YOUTUBE_SEGMENT_TEXT_LIMIT_EXCEEDED");
  }
  return {
    startSeconds: segment.startSeconds,
    ...(segment.durationSeconds !== undefined
      ? { durationSeconds: segment.durationSeconds }
      : {}),
    text,
    inputIndex,
  };
}

function requireBoundedText(value: string, maxLength: number, code: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new YouTubeSourceValidationError(code);
  }
  return normalized;
}

function assertIsoTimestamp(value: string, code: string): void {
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new YouTubeSourceValidationError(code);
  }
}
