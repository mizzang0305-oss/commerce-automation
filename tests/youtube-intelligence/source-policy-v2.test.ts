import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  BLOCKED_YOUTUBE_INTELLIGENCE_SOURCE_MODES,
  DisabledOwnChannelAuthorizedPerformanceProvider,
  EXACT_FIVE_OWNER_OBSERVATION_VIDEO_IDS,
  assertYouTubeIntelligenceSourceMode,
  buildBoundedExternalObservationPattern,
  createExactFiveOwnerObservationPackets,
  createSeparatedYouTubeIntelligenceEvidence,
  validateExternalCreativeObservation,
  validateOwnChannelCommerceBinding,
  validateOwnChannelPerformanceSnapshot,
  type ExternalCreativeObservation,
} from "../../src/lib/video-lab/youtube-intelligence";

const observation: ExternalCreativeObservation = {
  sourceUrl: "https://youtu.be/o5pWTuI-qvc?t=1",
  videoId: "o5pWTuI-qvc",
  observedBy: "owner",
  observedAt: "2026-08-16T00:00:00.000Z",
  hookFamily: "problem",
  hookParaphrase: "Owner-written paraphrase",
  hookStartSeconds: 0,
  structure: ["HOOK", "DEMONSTRATION", "CTA"],
  ctaObserved: true,
  ctaStartSeconds: 20,
  visualPatterns: ["close-up demonstration"],
  topicTags: ["commerce"],
  rawMediaReuseAllowed: false,
};

describe("YouTube Creative Intelligence V2 source policy", () => {
  it("accepts only the three explicit source classes", () => {
    expect(assertYouTubeIntelligenceSourceMode("synthetic_fixture")).toBe("synthetic_fixture");
    expect(assertYouTubeIntelligenceSourceMode("owner_provided_external_evidence")).toBe("owner_provided_external_evidence");
    expect(assertYouTubeIntelligenceSourceMode("own_channel_authorized_api")).toBe("own_channel_authorized_api");
  });

  it.each(BLOCKED_YOUTUBE_INTELLIGENCE_SOURCE_MODES)("fails closed for blocked source mode %s", (mode) => {
    expect(() => assertYouTubeIntelligenceSourceMode(mode)).toThrow(`YOUTUBE_SOURCE_MODE_BLOCKED:${mode}`);
  });

  it("accepts bounded owner observation evidence and never grants raw media reuse", () => {
    expect(validateExternalCreativeObservation(observation)).toMatchObject({
      sourceUrl: "https://www.youtube.com/watch?v=o5pWTuI-qvc",
      observedBy: "owner",
      rawMediaReuseAllowed: false,
    });
    expect(() => validateExternalCreativeObservation({ ...observation, rawMediaReuseAllowed: true } as unknown as ExternalCreativeObservation)).toThrow("RAW_MEDIA_REUSE_FORBIDDEN");
    expect(buildBoundedExternalObservationPattern([observation])).toEqual({
      confidenceScope: "BOUNDED_EXTERNAL_OBSERVATION",
      observationCount: 1,
      globalTrendClaimAllowed: false,
      rawMediaReuseAllowed: false,
    });
  });

  it("keeps exact-five packets pending without transcript recovery", () => {
    const packets = createExactFiveOwnerObservationPackets();
    expect(packets.map((packet) => packet.videoId)).toEqual(EXACT_FIVE_OWNER_OBSERVATION_VIDEO_IDS);
    expect(packets).toHaveLength(5);
    expect(packets.every((packet) => packet.status === "OWNER_OBSERVATION_REQUIRED" && packet.rawMediaReuseAllowed === false)).toBe(true);
  });

  it("keeps the future own-channel provider disabled and validates explicit first-party provenance", async () => {
    const provider = new DisabledOwnChannelAuthorizedPerformanceProvider();
    expect(provider).toMatchObject({ enabled: false, sourceMode: "own_channel_authorized_api" });
    await expect(provider.load()).rejects.toThrow("YOUTUBE_OWN_CHANNEL_AUTHORIZATION_DISABLED");
    expect(validateOwnChannelPerformanceSnapshot({ videoId: "OWNVIDEO001", observedAt: "2026-08-16T00:00:00.000Z", views: 10, averagePercentageViewed: 0.5, source: "youtube_authorized" })).toMatchObject({ views: 10, source: "youtube_authorized" });
    expect(validateOwnChannelPerformanceSnapshot({ videoId: "OWNVIDEO001", observedAt: "2026-08-16T00:00:00.000Z", affiliateClicks: 3, conversions: 1, attributedRevenue: 1000, source: "commerce_first_party" })).toMatchObject({ conversions: 1, source: "commerce_first_party" });
    expect(() => validateOwnChannelPerformanceSnapshot({ videoId: "OWNVIDEO001", observedAt: "2026-08-16T00:00:00.000Z", views: 10, affiliateClicks: 3, source: "youtube_authorized" })).toThrow("OWN_CHANNEL_PROVENANCE_FIELD_MISMATCH");
    expect(validateOwnChannelCommerceBinding({ videoId: "OWNVIDEO001", creativeId: "creative-1", productKey: "product-1", publishedAt: "2026-08-16T00:00:00.000Z" })).toMatchObject({ creativeId: "creative-1", productKey: "product-1" });
  });

  it("stores external observations and own performance in separate collections with no Production authority", () => {
    const datasets = createSeparatedYouTubeIntelligenceEvidence({
      externalCreativeObservations: [observation],
      ownChannelPerformanceEvidence: [{ videoId: "OWNVIDEO001", observedAt: "2026-08-16T00:00:00.000Z", impressions: 10, source: "youtube_authorized" }],
    });
    expect(datasets.externalCreativeObservations).toHaveLength(1);
    expect(datasets.ownChannelPerformanceEvidence).toHaveLength(1);
    expect(datasets.productionRankingImportAllowed).toBe(false);
    expect(datasets.externalCreativeObservations[0]).not.toHaveProperty("impressions");
    expect(datasets.ownChannelPerformanceEvidence[0]).not.toHaveProperty("hookParaphrase");
  });

  it("contains no Production ranking, upload adapter, or external writer import", () => {
    const root = path.join(process.cwd(), "src", "lib", "video-lab", "youtube-intelligence");
    const source = walk(root).filter((file) => file.endsWith(".ts")).map((file) => readFileSync(file, "utf8")).join("\n");
    expect(source).not.toMatch(/from\s+["'][^"']*(?:queue-scheduler|uploads|google-sheets|supabase|daily69-first-operation)/u);
    expect(source).not.toMatch(/productionRankingImportAllowed:\s*true|videos\.insert\s*\(|fetch\s*\(/u);
  });
});

function walk(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const target = path.join(root, name);
    return statSync(target).isDirectory() ? walk(target) : [target];
  });
}
