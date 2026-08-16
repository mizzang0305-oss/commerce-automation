import { createHash } from "node:crypto";
import {
  OWNER_OBSERVATION_HOOK_FAMILIES,
  OWNER_OBSERVATION_STRUCTURE_STEPS,
  validateExternalCreativeObservation,
  validateOwnChannelPerformanceSnapshot,
  YouTubeSourcePolicyError,
  type ExternalCreativeObservation,
  type OwnerObservationHookFamily,
  type OwnerObservationStructureStep,
  type OwnChannelPerformanceSnapshot,
} from "./sourcePolicy";

export interface CommerceCreativeLineage {
  creativeId: string;
  productKey: string;
  queueId: string;
  operationNamespace?: string;
  creativeVersion: string;
  hookFamily?: OwnerObservationHookFamily;
  structure: OwnerObservationStructureStep[];
  ctaFamily?: string;
  generatedAt: string;
  publishedVideoId?: string;
  publishedAt?: string;
}

export interface CreativeFeatureSnapshot {
  creativeId: string;
  featureSchemaVersion: "commerce-creative-features-v1";
  hookFamily: OwnerObservationHookFamily;
  hookStartSeconds: number;
  structure: OwnerObservationStructureStep[];
  ctaFamily: string;
  captionDensity: number;
  speechDensity: number;
  sceneCount: number;
  durationSeconds: number;
  productKey: string;
  useCase: string;
  creativeScore: number;
  featureFingerprint: string;
}

export interface CommerceFirstPartyPerformance {
  creativeId: string;
  videoId: string;
  productKey: string;
  publishedAt: string;
  observedAt: string;
  affiliateClicks: number;
  conversionCount: number;
  revenue: number;
  orders: number;
  provenance: {
    source: "commerce_first_party";
    evidenceId: string;
  };
}

export interface CreativeOutcomeEvidence {
  creativeId: string;
  videoId: string;
  productKey: string;
  publishedAt: string;
  creativeFeatures: CreativeFeatureSnapshot;
  youtubePerformance?: OwnChannelPerformanceSnapshot;
  commercePerformance?: CommerceFirstPartyPerformance;
  observedAt: string;
  researchOnly: true;
  productionRankingAllowed: false;
}

export function validateCommerceCreativeLineage(input: CommerceCreativeLineage): CommerceCreativeLineage {
  for (const value of [input.creativeId, input.productKey, input.queueId, input.creativeVersion]) {
    if (!value?.trim()) throw new YouTubeSourcePolicyError("CREATIVE_LINEAGE_IDENTIFIER_REQUIRED");
  }
  assertIso(input.generatedAt, "CREATIVE_LINEAGE_GENERATED_AT_INVALID");
  if (!Array.isArray(input.structure) || input.structure.length === 0 || input.structure.some((step) => !(OWNER_OBSERVATION_STRUCTURE_STEPS as readonly string[]).includes(step))) {
    throw new YouTubeSourcePolicyError("CREATIVE_LINEAGE_STRUCTURE_INVALID");
  }
  if (input.hookFamily && !(OWNER_OBSERVATION_HOOK_FAMILIES as readonly string[]).includes(input.hookFamily)) throw new YouTubeSourcePolicyError("CREATIVE_LINEAGE_HOOK_INVALID");
  if (Boolean(input.publishedVideoId) !== Boolean(input.publishedAt)) throw new YouTubeSourcePolicyError("CREATIVE_LINEAGE_PUBLICATION_BINDING_INCOMPLETE");
  if (input.publishedVideoId && !/^[A-Za-z0-9_-]{11}$/u.test(input.publishedVideoId)) throw new YouTubeSourcePolicyError("CREATIVE_LINEAGE_VIDEO_ID_INVALID");
  if (input.publishedAt) assertIso(input.publishedAt, "CREATIVE_LINEAGE_PUBLISHED_AT_INVALID");
  return { ...input, structure: [...input.structure] };
}

export function createCreativeFeatureSnapshot(input: Omit<CreativeFeatureSnapshot, "featureSchemaVersion" | "featureFingerprint">): CreativeFeatureSnapshot {
  if (!input.creativeId.trim() || !input.productKey.trim() || !input.ctaFamily.trim() || !input.useCase.trim()) throw new YouTubeSourcePolicyError("CREATIVE_FEATURE_IDENTIFIER_REQUIRED");
  if (!(OWNER_OBSERVATION_HOOK_FAMILIES as readonly string[]).includes(input.hookFamily)) throw new YouTubeSourcePolicyError("CREATIVE_FEATURE_HOOK_INVALID");
  if (!Array.isArray(input.structure) || input.structure.length === 0 || input.structure.some((step) => !(OWNER_OBSERVATION_STRUCTURE_STEPS as readonly string[]).includes(step))) throw new YouTubeSourcePolicyError("CREATIVE_FEATURE_STRUCTURE_INVALID");
  for (const value of [input.hookStartSeconds, input.captionDensity, input.speechDensity, input.durationSeconds, input.creativeScore]) {
    if (!Number.isFinite(value) || value < 0) throw new YouTubeSourcePolicyError("CREATIVE_FEATURE_METRIC_INVALID");
  }
  if (input.captionDensity > 1 || input.speechDensity > 1 || input.creativeScore > 100 || !Number.isInteger(input.sceneCount) || input.sceneCount < 1) throw new YouTubeSourcePolicyError("CREATIVE_FEATURE_METRIC_INVALID");
  const canonical = { ...input, structure: [...input.structure], featureSchemaVersion: "commerce-creative-features-v1" as const };
  return { ...canonical, featureFingerprint: hash(JSON.stringify(canonical)) };
}

export function validateCommerceFirstPartyPerformance(input: CommerceFirstPartyPerformance): CommerceFirstPartyPerformance {
  for (const value of [input.creativeId, input.videoId, input.productKey, input.provenance?.evidenceId]) {
    if (!value?.trim()) throw new YouTubeSourcePolicyError("COMMERCE_PERFORMANCE_IDENTIFIER_REQUIRED");
  }
  if (!/^[A-Za-z0-9_-]{11}$/u.test(input.videoId)) throw new YouTubeSourcePolicyError("COMMERCE_PERFORMANCE_VIDEO_ID_INVALID");
  if (input.provenance.source !== "commerce_first_party") throw new YouTubeSourcePolicyError("COMMERCE_PERFORMANCE_PROVENANCE_INVALID");
  assertIso(input.publishedAt, "COMMERCE_PERFORMANCE_PUBLISHED_AT_INVALID");
  assertIso(input.observedAt, "COMMERCE_PERFORMANCE_OBSERVED_AT_INVALID");
  for (const value of [input.affiliateClicks, input.conversionCount, input.revenue, input.orders]) {
    if (!Number.isFinite(value) || value < 0) throw new YouTubeSourcePolicyError("COMMERCE_PERFORMANCE_METRIC_INVALID");
  }
  return { ...input, provenance: { ...input.provenance } };
}

export function joinCreativeOutcomeEvidence(input: {
  lineage: CommerceCreativeLineage;
  features: CreativeFeatureSnapshot;
  youtubePerformance?: OwnChannelPerformanceSnapshot;
  commercePerformance?: CommerceFirstPartyPerformance;
  observedAt: string;
}): CreativeOutcomeEvidence {
  const lineage = validateCommerceCreativeLineage(input.lineage);
  if (!lineage.publishedVideoId || !lineage.publishedAt) throw new YouTubeSourcePolicyError("CREATIVE_OUTCOME_PUBLICATION_REQUIRED");
  const { featureFingerprint, featureSchemaVersion, ...featureInput } = input.features;
  if (featureSchemaVersion !== "commerce-creative-features-v1" || createCreativeFeatureSnapshot(featureInput).featureFingerprint !== featureFingerprint) throw new YouTubeSourcePolicyError("CREATIVE_OUTCOME_FEATURE_FINGERPRINT_INVALID");
  if (input.features.creativeId !== lineage.creativeId || input.features.productKey !== lineage.productKey) throw new YouTubeSourcePolicyError("CREATIVE_OUTCOME_FEATURE_BINDING_MISMATCH");
  const youtube = input.youtubePerformance ? validateOwnChannelPerformanceSnapshot(input.youtubePerformance) : undefined;
  if (youtube && (youtube.source !== "youtube_authorized" || youtube.videoId !== lineage.publishedVideoId || (youtube.publishedAt && youtube.publishedAt !== lineage.publishedAt))) {
    throw new YouTubeSourcePolicyError("CREATIVE_OUTCOME_YOUTUBE_BINDING_MISMATCH");
  }
  const commerce = input.commercePerformance ? validateCommerceFirstPartyPerformance(input.commercePerformance) : undefined;
  if (commerce && (commerce.creativeId !== lineage.creativeId || commerce.videoId !== lineage.publishedVideoId || commerce.productKey !== lineage.productKey || commerce.publishedAt !== lineage.publishedAt)) {
    throw new YouTubeSourcePolicyError("CREATIVE_OUTCOME_COMMERCE_BINDING_MISMATCH");
  }
  assertIso(input.observedAt, "CREATIVE_OUTCOME_OBSERVED_AT_INVALID");
  return {
    creativeId: lineage.creativeId,
    videoId: lineage.publishedVideoId,
    productKey: lineage.productKey,
    publishedAt: lineage.publishedAt,
    creativeFeatures: input.features,
    youtubePerformance: youtube,
    commercePerformance: commerce,
    observedAt: input.observedAt,
    researchOnly: true,
    productionRankingAllowed: false,
  };
}

export function createFirstPartyCreativeDatasets(input: {
  externalCreativeObservations?: readonly ExternalCreativeObservation[];
  ownCreativeLineage?: readonly CommerceCreativeLineage[];
  ownChannelPerformance?: readonly OwnChannelPerformanceSnapshot[];
  commerceFirstPartyPerformance?: readonly CommerceFirstPartyPerformance[];
  derivedCreativeOutcomeEvidence?: readonly CreativeOutcomeEvidence[];
} = {}) {
  return {
    externalCreativeObservations: (input.externalCreativeObservations ?? []).map(validateExternalCreativeObservation),
    ownCreativeLineage: (input.ownCreativeLineage ?? []).map(validateCommerceCreativeLineage),
    ownChannelPerformance: (input.ownChannelPerformance ?? []).map(validateOwnChannelPerformanceSnapshot),
    commerceFirstPartyPerformance: (input.commerceFirstPartyPerformance ?? []).map(validateCommerceFirstPartyPerformance),
    derivedCreativeOutcomeEvidence: [...(input.derivedCreativeOutcomeEvidence ?? [])],
    productionRankingAllowed: false as const,
  };
}

function assertIso(value: string, code: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) throw new YouTubeSourcePolicyError(code);
}
function hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
