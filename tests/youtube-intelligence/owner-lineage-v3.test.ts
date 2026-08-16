import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildOwnerObservationRequirementsReport,
  createCreativeFeatureSnapshot,
  createFirstPartyCreativeDatasets,
  joinCreativeOutcomeEvidence,
  validateCommerceCreativeLineage,
  validateCompletedOwnerObservationPacket,
  type CommerceCreativeLineage,
  type CommerceFirstPartyPerformance,
  type EditableOwnerObservationPacket,
} from "../../src/lib/video-lab/youtube-intelligence";

const packet: EditableOwnerObservationPacket = {
  videoId: "o5pWTuI-qvc",
  sourceUrl: "https://youtu.be/o5pWTuI-qvc?t=2",
  sourceMode: "owner_provided_external_evidence",
  status: "OWNER_OBSERVATION_DRAFT",
  observation: {
    observedBy: "owner",
    observedAt: "2026-08-16T00:00:00.000Z",
    hookFamily: "problem",
    hookParaphrase: "Owner paraphrase",
    hookStartSeconds: 0,
    structure: ["HOOK", "DEMONSTRATION", "CTA"],
    ctaObserved: true,
    ctaStartSeconds: 20,
    visualPatterns: ["close-up demonstration"],
    topicTags: ["commerce"],
    notes: "Bounded owner notes",
    rawMediaReuseAllowed: false,
  },
};

const lineage: CommerceCreativeLineage = {
  creativeId: "creative-001",
  productKey: "product-001",
  queueId: "queue-001",
  operationNamespace: "operation-2026-08-17-attempt-2",
  creativeVersion: "v1",
  hookFamily: "problem",
  structure: ["HOOK", "DEMONSTRATION", "CTA"],
  ctaFamily: "direct",
  generatedAt: "2026-08-16T00:00:00.000Z",
  publishedVideoId: "OWNVIDEO001",
  publishedAt: "2026-08-18T00:00:00.000Z",
};

const featureInput = {
  creativeId: "creative-001",
  hookFamily: "problem" as const,
  hookStartSeconds: 0,
  structure: ["HOOK", "DEMONSTRATION", "CTA"] as ["HOOK", "DEMONSTRATION", "CTA"],
  ctaFamily: "direct",
  captionDensity: 0.5,
  speechDensity: 0.7,
  sceneCount: 4,
  durationSeconds: 28,
  productKey: "product-001",
  useCase: "daily-use",
  creativeScore: 91,
};
const features = createCreativeFeatureSnapshot(featureInput);

const commercePerformance: CommerceFirstPartyPerformance = {
  creativeId: "creative-001",
  videoId: "OWNVIDEO001",
  productKey: "product-001",
  publishedAt: "2026-08-18T00:00:00.000Z",
  observedAt: "2026-08-19T00:00:00.000Z",
  affiliateClicks: 3,
  conversionCount: 1,
  revenue: 1000,
  orders: 1,
  provenance: { source: "commerce_first_party", evidenceId: "commerce-ledger-001" },
};

describe("YouTube Creative Intelligence V3 owner lineage", () => {
  it("accepts a complete owner observation and canonicalizes exact source binding", () => {
    expect(validateCompletedOwnerObservationPacket(packet)).toMatchObject({
      sourceUrl: "https://www.youtube.com/watch?v=o5pWTuI-qvc",
      status: "OWNER_OBSERVATION_VALIDATED",
      observation: { rawMediaReuseAllowed: false },
    });
  });

  it("rejects missing source binding, invalid hook enum, invalid timing, and raw media reuse", () => {
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, videoId: "NB07HjOa1nc" })).toThrow("EXTERNAL_OBSERVATION_VIDEO_BINDING_MISMATCH");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, sourceMode: "synthetic_fixture" as "owner_provided_external_evidence" })).toThrow("OWNER_OBSERVATION_SOURCE_MODE_INVALID");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, hookFamily: "viral" as "problem" } })).toThrow("EXTERNAL_OBSERVATION_HOOK_FAMILY_INVALID");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, hookStartSeconds: -1 } })).toThrow("EXTERNAL_OBSERVATION_TIMESTAMP_RANGE_INVALID");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, structure: ["VIRAL"] } })).toThrow("EXTERNAL_OBSERVATION_STRUCTURE_STEP_INVALID");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, ctaObserved: true, ctaStartSeconds: undefined } })).toThrow("EXTERNAL_OBSERVATION_CTA_TIMING_REQUIRED");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, notes: "x".repeat(2_001) } })).toThrow("EXTERNAL_OBSERVATION_NOTES_TOO_LONG");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, topicTags: ["x".repeat(81)] } })).toThrow("EXTERNAL_OBSERVATION_LABEL_TOO_LONG");
    expect(() => validateCompletedOwnerObservationPacket({ ...packet, observation: { ...packet.observation, rawMediaReuseAllowed: true as false } })).toThrow("RAW_MEDIA_REUSE_FORBIDDEN");
  });

  it("keeps exact-five template packets required and reports owner fields without inventing observations", () => {
    const source = JSON.parse(readFileSync(path.join(process.cwd(), "docs", "youtube-intelligence", "owner-observations", "EXACT_FIVE_OWNER_OBSERVATION_PACKETS.json"), "utf8")) as { packets: Record<string, unknown>[] };
    const report = buildOwnerObservationRequirementsReport(source);
    expect(report).toMatchObject({ packetCount: 5, validatedCount: 0, automatedTranscriptRecoveryAllowed: false, rawMediaReuseAllowed: false });
    expect(report.packets.every((entry) => entry.status === "OWNER_OBSERVATION_REQUIRED" && entry.missingFields.length > 0)).toBe(true);
  });

  it("validates creative lineage identifiers and deterministic feature fingerprints", () => {
    expect(validateCommerceCreativeLineage(lineage)).toMatchObject({ creativeId: "creative-001", productKey: "product-001", publishedVideoId: "OWNVIDEO001" });
    expect(features.featureFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    expect(createCreativeFeatureSnapshot(featureInput).featureFingerprint).toBe(features.featureFingerprint);
    expect(() => validateCommerceCreativeLineage({ ...lineage, creativeId: "" })).toThrow("CREATIVE_LINEAGE_IDENTIFIER_REQUIRED");
    expect(() => validateCommerceCreativeLineage({ ...lineage, productKey: "" })).toThrow("CREATIVE_LINEAGE_IDENTIFIER_REQUIRED");
  });

  it("joins only exact creativeId, videoId, productKey, and publishedAt", () => {
    const joined = joinCreativeOutcomeEvidence({
      lineage,
      features,
      youtubePerformance: { videoId: "OWNVIDEO001", publishedAt: lineage.publishedAt, observedAt: "2026-08-19T00:00:00.000Z", views: 100, source: "youtube_authorized" },
      commercePerformance,
      observedAt: "2026-08-19T00:00:00.000Z",
    });
    expect(joined).toMatchObject({ creativeId: "creative-001", videoId: "OWNVIDEO001", productKey: "product-001", researchOnly: true, productionRankingAllowed: false });
    expect(() => joinCreativeOutcomeEvidence({ lineage, features, commercePerformance: { ...commercePerformance, creativeId: "creative-near" }, observedAt: "2026-08-19T00:00:00.000Z" })).toThrow("CREATIVE_OUTCOME_COMMERCE_BINDING_MISMATCH");
    expect(() => joinCreativeOutcomeEvidence({ lineage, features, youtubePerformance: { videoId: "OWNVIDEO002", observedAt: "2026-08-19T00:00:00.000Z", views: 100, source: "youtube_authorized" }, observedAt: "2026-08-19T00:00:00.000Z" })).toThrow("CREATIVE_OUTCOME_YOUTUBE_BINDING_MISMATCH");
  });

  it("keeps external observations separate from own performance and ranking authority", () => {
    const external = validateCompletedOwnerObservationPacket(packet).observation;
    const datasets = createFirstPartyCreativeDatasets({
      externalCreativeObservations: [external],
      ownCreativeLineage: [lineage],
      ownChannelPerformance: [{ videoId: "OWNVIDEO001", observedAt: "2026-08-19T00:00:00.000Z", views: 100, source: "youtube_authorized" }],
      commerceFirstPartyPerformance: [commercePerformance],
    });
    expect(datasets.externalCreativeObservations[0]).toHaveProperty("hookParaphrase");
    expect(datasets.ownChannelPerformance[0]).not.toHaveProperty("hookParaphrase");
    expect(datasets.commerceFirstPartyPerformance[0]).not.toHaveProperty("views");
    expect(datasets.productionRankingAllowed).toBe(false);
  });

  it("contains no network, upload, Production DB, or ranking-writer imports", () => {
    const files = ["ownerObservation.ts", "firstPartyLineage.ts"].map((name) => readFileSync(path.join(process.cwd(), "src", "lib", "video-lab", "youtube-intelligence", name), "utf8")).join("\n");
    expect(files).not.toMatch(/fetch\s*\(|youtube.*api|from\s+["'][^"']*(?:uploads|supabase|google-sheets|queue-scheduler)|productionRankingAllowed:\s*true/iu);
    expect(files).not.toContain("AUTO_APPROVED");
  });
});
