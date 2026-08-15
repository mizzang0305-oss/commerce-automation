import { describe, expect, it } from "vitest";

import {
  DEFAULT_YOUTUBE_INTELLIGENCE_FLAGS,
  DisabledCreativeIntelligenceModel,
  DisabledVisionEvidenceProvider,
  YouTubeSourceValidationError,
  assertSourceBinding,
  assertSyntheticFixtureOnly,
  buildYouTubeSourceSnapshot,
  canonicalizePublicYouTubeUrl,
  normalizeTranscript,
} from "../../src/lib/video-lab/youtube-intelligence";

describe("YouTube Creative Intelligence source contracts", () => {
  it.each([
    "https://www.youtube.com/watch?v=YTCI0000001",
    "https://youtu.be/YTCI0000001?t=1",
    "https://youtube.com/shorts/YTCI0000001",
    "https://m.youtube.com/embed/YTCI0000001",
  ])("canonicalizes approved public URLs without retaining query noise: %s", (url) => {
    expect(canonicalizePublicYouTubeUrl(url)).toEqual({
      canonicalUrl: "https://www.youtube.com/watch?v=YTCI0000001",
      videoId: "YTCI0000001",
    });
  });

  it.each([
    ["", "YOUTUBE_URL_MISSING"],
    ["not a url", "YOUTUBE_URL_INVALID"],
    ["http://youtube.com/watch?v=YTCI0000001", "YOUTUBE_URL_HTTPS_REQUIRED"],
    ["https://user:pass@youtube.com/watch?v=YTCI0000001", "YOUTUBE_URL_CREDENTIALS_FORBIDDEN"],
    ["https://youtube.example/watch?v=YTCI0000001", "YOUTUBE_URL_HOST_REJECTED"],
    ["javascript:alert(1)", "YOUTUBE_URL_HTTPS_REQUIRED"],
    ["file:///tmp/YTCI0000001", "YOUTUBE_URL_HTTPS_REQUIRED"],
    ["data:text/plain,YTCI0000001", "YOUTUBE_URL_HTTPS_REQUIRED"],
    ["https://youtube.com/watch?v=short", "YOUTUBE_VIDEO_ID_INVALID"],
    ["https://youtu.be/YTCI0000001/extra", "YOUTUBE_VIDEO_ID_INVALID"],
    ["https://youtube.com/shorts/YTCI0000001/extra", "YOUTUBE_VIDEO_ID_INVALID"],
  ])("rejects unsafe source URL %s", (url, code) => {
    expect(() => canonicalizePublicYouTubeUrl(url)).toThrowError(
      new YouTubeSourceValidationError(code),
    );
  });

  it("sorts segments stably, binds them to the source, and never grants raw media reuse", () => {
    const snapshot = fixtureSnapshot();
    const transcript = normalizeTranscript(snapshot, [
      { startSeconds: 5, text: "second" },
      { startSeconds: 1, durationSeconds: 2, text: "first" },
      { startSeconds: 5, text: "third" },
      { startSeconds: 6, text: "   " },
    ]);

    expect(transcript.segments.map((segment) => [segment.sequence, segment.startSeconds, segment.text])).toEqual([
      [0, 1, "first"],
      [1, 5, "second"],
      [2, 5, "third"],
    ]);
    expect(transcript.segments.every((segment) => segment.videoId === snapshot.videoId)).toBe(true);
    expect(snapshot.rawMediaReuseAllowed).toBe(false);
    expect(() => assertSourceBinding(snapshot, transcript)).not.toThrow();
  });

  it("fails closed on segment and source binding violations", () => {
    const snapshot = fixtureSnapshot();
    expect(() => normalizeTranscript(snapshot, [{ startSeconds: -1, text: "bad" }])).toThrow(
      "YOUTUBE_SEGMENT_START_INVALID",
    );
    expect(() =>
      normalizeTranscript(snapshot, [{ startSeconds: 0, text: "x".repeat(2_001) }]),
    ).toThrow("YOUTUBE_SEGMENT_TEXT_LIMIT_EXCEEDED");

    const transcript = normalizeTranscript(snapshot, [{ startSeconds: 0, text: "bound" }]);
    expect(() =>
      assertSourceBinding({ ...snapshot, sourceId: "different-source" }, transcript),
    ).toThrow("YOUTUBE_SOURCE_BINDING_MISMATCH");
  });

  it("requires an explicit ISO timestamp for source provenance", () => {
    expect(() =>
      buildYouTubeSourceSnapshot({
        ...fixtureSnapshot(),
        url: "https://www.youtube.com/watch?v=YTCI0000001",
        observedAt: "August 1, 2026",
        provenanceRepository: "synthetic_fixture",
      }),
    ).toThrow("YOUTUBE_OBSERVED_AT_INVALID");
  });
});

describe("YouTube Creative Intelligence default safety", () => {
  it("keeps every live, remote, cookie, LLM, and production bridge flag disabled", () => {
    expect(DEFAULT_YOUTUBE_INTELLIGENCE_FLAGS).toEqual({
      YOUTUBE_INTELLIGENCE_ENABLED: false,
      YOUTUBE_INTELLIGENCE_LIVE_INGEST: false,
      YOUTUBE_REMOTE_VIDEO_DOWNLOAD_ENABLED: false,
      YOUTUBE_AUDIO_DOWNLOAD_ENABLED: false,
      YOUTUBE_COOKIE_AUTH_ENABLED: false,
      YOUTUBE_REMOTE_FRAME_EXTRACTION_ENABLED: false,
      YOUTUBE_INTELLIGENCE_LLM_ENABLED: false,
      YOUTUBE_INTELLIGENCE_PRODUCTION_BRIDGE_ENABLED: false,
    });
    expect(() => assertSyntheticFixtureOnly()).not.toThrow();
  });

  it("blocks any unsafe flag and exposes disabled provider seams only", async () => {
    expect(() =>
      assertSyntheticFixtureOnly({
        ...DEFAULT_YOUTUBE_INTELLIGENCE_FLAGS,
        YOUTUBE_INTELLIGENCE_LIVE_INGEST: true,
      }),
    ).toThrow("YOUTUBE_INTELLIGENCE_RESEARCH_BOUNDARY_BLOCKED");

    const snapshot = fixtureSnapshot();
    const transcript = normalizeTranscript(snapshot, [{ startSeconds: 0, text: "fixture" }]);
    await expect(
      new DisabledCreativeIntelligenceModel().analyze({ snapshot, transcript }),
    ).rejects.toThrow(
      "YOUTUBE_INTELLIGENCE_LLM_DISABLED",
    );
    await expect(new DisabledVisionEvidenceProvider().collect(snapshot)).rejects.toThrow(
      "YOUTUBE_REMOTE_FRAME_EXTRACTION_DISABLED",
    );
  });
});

function fixtureSnapshot() {
  return buildYouTubeSourceSnapshot({
    sourceId: "contract-fixture",
    url: "https://www.youtube.com/watch?v=YTCI0000001",
    title: "Synthetic contract fixture",
    channelId: "synthetic-channel",
    channelTitle: "Synthetic Channel",
    observedAt: "2026-08-01T00:00:00.000Z",
    durationSeconds: 60,
    transcriptAvailable: true,
    metadataAvailable: true,
    provenanceRepository: "synthetic_fixture",
  });
}
