import { z } from "zod";

const channelKey = z.enum(["neoman_moleulgeol", "father_jobs"]);
const iso = z.iso.datetime({ offset: true });
const date = z.iso.date();
const time = z.string().regex(/^(?:0\d|1\d|2[01]):[0-5]\d$/u);

const settingsFields = {
  enabled: z.boolean(),
  dailyGenerateTarget: z.number().int().min(1).max(3),
  maxItemsPerRun: z.literal(1),
  generationSlots: z.array(time).min(1).max(3).refine((slots) =>
    new Set(slots).size === slots.length && slots.every((slot, index) => index === 0 || slots[index - 1] < slot)),
  timeZone: z.literal("Asia/Seoul"),
  revision: z.number().int().nonnegative()
};
export const studioSettingsSchema = z.strictObject(settingsFields).refine((settings) => settings.generationSlots.length >= settings.dailyGenerateTarget);
export const studioSettingsInputSchema = z.strictObject({
  enabled: settingsFields.enabled, dailyGenerateTarget: settingsFields.dailyGenerateTarget,
  maxItemsPerRun: settingsFields.maxItemsPerRun, generationSlots: settingsFields.generationSlots,
  timeZone: settingsFields.timeZone
}).refine((settings) => settings.generationSlots.length >= settings.dailyGenerateTarget);

export const studioSlotRecordSchema = z.strictObject({
  date, slot: time, status: z.enum(["running", "succeeded", "failed"]),
  createdAt: iso, updatedAt: iso, productId: z.string(), uploadJobId: z.string(), safeError: z.string()
});

export const studioJobSchema = z.strictObject({
  id: z.string().min(1), productId: z.string().min(1), productName: z.string().min(1),
  channelKey, status: z.enum(["ready", "uploading", "uploaded", "error", "manual_review"]),
  createdAt: iso, publishedAt: iso.nullable(), youtubeVideoId: z.string(),
  youtubeUrl: z.string(), title: z.string()
});

export const studioLedgerSchema = z.strictObject({
  youtubeVideoId: z.string().min(1), productId: z.string().min(1),
  channelKey, channelId: z.string().min(1), visibility: z.literal("public"),
  recordedAt: iso, publishedAt: iso.nullable(), youtubeUrl: z.string()
});

export const studioCandidateSchema = z.strictObject({
  snapshotId: z.string().min(1), slotId: z.string().regex(/^\d{4}-\d{2}-\d{2}\|(?:0\d|1\d|2[01]):[0-5]\d$/u),
  sourceRevision: z.string().min(1), productId: z.string().regex(/^coupang:product:\d+:item:\d+:vendor:\d+$/u), productName: z.string().min(1),
  channelKey, eligible: z.boolean(), eligibilityCheckedAt: iso, safeBlockers: z.array(z.string()).max(20)
});

export const studioPlanSchema = z.strictObject({
  planId: z.string().min(1), date, slot: time, version: z.number().int().nonnegative(),
  status: z.enum(["unassigned", "selected", "held", "claimed", "completed", "failed"]),
  selectionMode: z.enum(["auto", "manual"]), candidateSnapshotId: z.string().nullable(),
  exactProductId: z.string().nullable(), channelKey: channelKey.nullable(),
  selectedAt: iso.nullable(), lockedAt: iso.nullable(), executionRecordId: z.string().nullable()
});

export const snapshotPayloadSchema = z.strictObject({
  producer: z.strictObject({ settings: studioSettingsSchema, slots: z.array(studioSlotRecordSchema).max(3000) }).nullable(),
  publisher: z.strictObject({ jobs: z.array(studioJobSchema).max(3000), ledger: z.array(studioLedgerSchema).max(3000) }).nullable(),
  plans: z.array(studioPlanSchema).max(100).nullable(),
  candidates: z.array(studioCandidateSchema).max(100).nullable()
});

export const snapshotEnvelopeSchema = z.strictObject({
  schemaVersion: z.literal(1), environmentId: z.string().min(1).max(80),
  ownerId: z.string().min(1).max(160), hostId: z.string().min(1).max(80),
  sourceRuntimeSha: z.string().regex(/^[0-9a-f]{40}$/u), sourceSequence: z.number().int().positive(),
  eventId: z.uuid(), observedAt: iso, sourceRevision: z.string().min(1).max(160),
  completeness: z.strictObject({ producer: z.boolean(), publisher: z.boolean(), plans: z.boolean(), candidates: z.boolean() }),
  payload: snapshotPayloadSchema
}).refine((envelope) => (["producer", "publisher", "plans", "candidates"] as const)
  .every((key) => envelope.completeness[key] === (envelope.payload[key] !== null)),
  { message: "STUDIO_SNAPSHOT_COMPLETENESS_MISMATCH" });

const commandBase = {
  commandId: z.uuid(), environmentId: z.string().min(1), ownerId: z.string().min(1),
  hostId: z.string().min(1), targetId: z.string().min(1), expectedVersion: z.number().int().nonnegative(),
  requestedAt: iso, expiresAt: iso
};
export const studioCommandSchema = z.discriminatedUnion("type", [
  z.strictObject({ ...commandBase, type: z.literal("SET_PRODUCER_SETTINGS"), payload: studioSettingsInputSchema }),
  z.strictObject({ ...commandBase, type: z.literal("SELECT_PRODUCT"), payload: z.strictObject({ candidateSnapshotId: z.string().min(1), productId: z.string().min(1) }) }),
  z.strictObject({ ...commandBase, type: z.literal("HOLD_PLAN"), payload: z.strictObject({}) })
]);

export type StudioSettings = z.infer<typeof studioSettingsSchema>;
export type StudioSnapshot = z.infer<typeof snapshotEnvelopeSchema>;
export type StudioSnapshotPayload = z.infer<typeof snapshotPayloadSchema>;
export type StudioPlan = z.infer<typeof studioPlanSchema>;
export type StudioCandidate = z.infer<typeof studioCandidateSchema>;
export type StudioCommand = z.infer<typeof studioCommandSchema>;
