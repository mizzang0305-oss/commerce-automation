import {
  OWNER_OBSERVATION_STATUSES,
  validateExternalCreativeObservation,
  YouTubeSourcePolicyError,
  type ExternalCreativeObservation,
  type OwnerObservationStatus,
} from "./sourcePolicy";

export interface EditableOwnerObservationPacket {
  videoId: string;
  sourceUrl: string;
  sourceMode: "owner_provided_external_evidence";
  status: OwnerObservationStatus;
  observation: Omit<ExternalCreativeObservation, "videoId" | "sourceUrl">;
}

export interface ValidatedOwnerObservationPacket extends Omit<EditableOwnerObservationPacket, "status"> {
  status: "OWNER_OBSERVATION_VALIDATED";
  observation: ExternalCreativeObservation;
}

export function validateCompletedOwnerObservationPacket(input: EditableOwnerObservationPacket): ValidatedOwnerObservationPacket {
  if (input.sourceMode !== "owner_provided_external_evidence") throw new YouTubeSourcePolicyError("OWNER_OBSERVATION_SOURCE_MODE_INVALID");
  if (!OWNER_OBSERVATION_STATUSES.includes(input.status)) throw new YouTubeSourcePolicyError("OWNER_OBSERVATION_STATUS_INVALID");
  if (input.status === "OWNER_OBSERVATION_REQUIRED") throw new YouTubeSourcePolicyError("OWNER_OBSERVATION_INCOMPLETE");
  const observation = validateExternalCreativeObservation({ ...input.observation, videoId: input.videoId, sourceUrl: input.sourceUrl });
  if (!observation.hookFamily || !observation.hookParaphrase?.trim() || observation.hookStartSeconds === undefined) {
    throw new YouTubeSourcePolicyError("OWNER_OBSERVATION_HOOK_REQUIRED");
  }
  if (observation.structure.length === 0 || observation.visualPatterns.length === 0 || observation.topicTags.length === 0) {
    throw new YouTubeSourcePolicyError("OWNER_OBSERVATION_BOUNDED_FIELDS_REQUIRED");
  }
  return {
    videoId: input.videoId,
    sourceUrl: observation.sourceUrl,
    sourceMode: "owner_provided_external_evidence",
    status: "OWNER_OBSERVATION_VALIDATED",
    observation,
  };
}

export function buildOwnerObservationRequirementsReport(input: { packets?: readonly Record<string, unknown>[] }) {
  const packets = Array.isArray(input.packets) ? input.packets : [];
  const entries = packets.map((packet) => {
    const observation = isRecord(packet.observation) ? packet.observation : {};
    const missingFields = [
      missingString(observation.observedAt) && "observedAt",
      missingString(observation.hookFamily) && "hookFamily",
      missingString(observation.hookParaphrase) && "hookParaphrase",
      !nonnegativeNumber(observation.hookStartSeconds) && "hookStartSeconds",
      !nonemptyArray(observation.structure) && "structure",
      typeof observation.ctaObserved !== "boolean" && "ctaObserved",
      observation.ctaObserved === true && !nonnegativeNumber(observation.ctaStartSeconds) && "ctaStartSeconds",
      !nonemptyArray(observation.visualPatterns) && "visualPatterns",
      !nonemptyArray(observation.topicTags) && "topicTags",
      observation.rawMediaReuseAllowed !== false && "rawMediaReuseAllowed=false",
    ].filter((value): value is string => Boolean(value));
    return {
      videoId: typeof packet.videoId === "string" ? packet.videoId : "",
      status: packet.status === "OWNER_OBSERVATION_VALIDATED" && missingFields.length === 0
        ? "OWNER_OBSERVATION_VALIDATED" as const
        : "OWNER_OBSERVATION_REQUIRED" as const,
      missingFields,
    };
  });
  return {
    schemaVersion: "youtube-owner-observation-requirements-report-v1" as const,
    packetCount: packets.length,
    validatedCount: entries.filter((entry) => entry.status === "OWNER_OBSERVATION_VALIDATED").length,
    packets: entries,
    automatedTranscriptRecoveryAllowed: false as const,
    rawMediaReuseAllowed: false as const,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function missingString(value: unknown) { return typeof value !== "string" || !value.trim(); }
function nonnegativeNumber(value: unknown) { return typeof value === "number" && Number.isFinite(value) && value >= 0; }
function nonemptyArray(value: unknown) { return Array.isArray(value) && value.length > 0; }
