import { createHash } from "node:crypto";
import { z } from "zod";
import { snapshotEnvelopeSchema, snapshotPayloadSchema, studioCommandSchema, type StudioCommand, type StudioSnapshot, type StudioSnapshotPayload } from "./contracts";

export type StudioHostBinding = { environmentId: string; ownerId: string; hostId: string };
export type StudioStoredCommand = { command: StudioCommand; status: "pending" | "applied" | "rejected"; receipt: string | null; appliedRevision: number | null };
export type StudioDocument = {
  snapshot: { envelope: StudioSnapshot; payload: StudioSnapshotPayload; receivedAt: string } | null;
  eventHashes: Record<string, string>;
  nonces: Record<string, number>;
  commands: Record<string, StudioStoredCommand>;
};
const documentSchema = z.strictObject({
  snapshot: z.strictObject({ envelope: snapshotEnvelopeSchema, payload: snapshotPayloadSchema,
    receivedAt: z.iso.datetime({ offset: true }) }).nullable(),
  eventHashes: z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/u)),
  nonces: z.record(z.string(), z.number().int().nonnegative()),
  commands: z.record(z.string(), z.strictObject({ command: studioCommandSchema,
    status: z.enum(["pending", "applied", "rejected"]), receipt: z.string().nullable(), appliedRevision: z.number().int().nonnegative().nullable() }))
});
export function parseStudioDocument(value: unknown): StudioDocument { return documentSchema.parse(value); }

export interface StudioCompareSwapStore {
  read(binding: StudioHostBinding): Promise<{ revision: number; document: StudioDocument } | null>;
  compareSwap(binding: StudioHostBinding, expectedRevision: number, document: StudioDocument): Promise<boolean>;
}

function initialDocument(): StudioDocument { return { snapshot: null, eventHashes: {}, nonces: {}, commands: {} }; }

/** All owner commands and host receipts use the same durable, optimistic-CAS document. */
export class DurableStudioBridge {
  constructor(private readonly store: StudioCompareSwapStore, private readonly binding: StudioHostBinding) {}

  async read(ownerId: string) {
    this.assertOwner(ownerId);
    return (await this.store.read(this.binding))?.document.snapshot ?? null;
  }

  async ingest(raw: unknown, receivedAt = new Date().toISOString()) {
    const envelope = snapshotEnvelopeSchema.parse(raw);
    this.assertBinding(envelope);
    const hash = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
    return this.change((document) => {
      const prior = document.eventHashes[envelope.eventId];
      if (prior) {
        if (prior !== hash) throw new Error("STUDIO_EVENT_ID_COLLISION");
        return { changed: false, result: "duplicate" as const };
      }
      if (document.snapshot && envelope.sourceSequence <= document.snapshot.envelope.sourceSequence) throw new Error("STUDIO_SOURCE_SEQUENCE_STALE");
      const previous = document.snapshot?.payload;
      const payload = {
        producer: envelope.completeness.producer ? envelope.payload.producer : previous?.producer ?? null,
        publisher: envelope.completeness.publisher ? envelope.payload.publisher : previous?.publisher ?? null,
        plans: envelope.completeness.plans ? envelope.payload.plans : previous?.plans ?? null,
        candidates: envelope.completeness.candidates ? envelope.payload.candidates : previous?.candidates ?? null
      };
      document.snapshot = { envelope, payload, receivedAt };
      document.eventHashes[envelope.eventId] = hash;
      // Old events cannot be replayed after eviction: their sequence is stale.
      const ids = Object.keys(document.eventHashes);
      if (ids.length > 256) for (const id of ids.slice(0, ids.length - 256)) delete document.eventHashes[id];
      return { changed: true, result: "accepted" as const };
    });
  }

  async useNonce(hostId: string, nonce: string, at = Date.now()) {
    this.assertHost(hostId);
    return this.change((document) => {
      for (const [key, timestamp] of Object.entries(document.nonces)) if (timestamp < at - 600_000) delete document.nonces[key];
      if (document.nonces[nonce]) return { changed: false, result: false };
      document.nonces[nonce] = at;
      return { changed: true, result: true };
    });
  }

  async enqueue(raw: unknown, ownerId: string, now = new Date()) {
    this.assertOwner(ownerId);
    const command = studioCommandSchema.parse(raw);
    this.assertBinding(command);
    if (new Date(command.expiresAt) <= now || new Date(command.requestedAt) > now || new Date(command.expiresAt) <= new Date(command.requestedAt)) throw new Error("STUDIO_COMMAND_EXPIRY_INVALID");
    return this.change((document) => {
      const existing = document.commands[command.commandId];
      if (existing) {
        if (JSON.stringify(existing.command) !== JSON.stringify(command)) throw new Error("STUDIO_COMMAND_ID_COLLISION");
        return { changed: false, result: existing };
      }
      if (Object.keys(document.commands).length >= 200) throw new Error("STUDIO_COMMAND_RETENTION_LIMIT_REACHED");
      const entry: StudioStoredCommand = { command, status: "pending", receipt: null, appliedRevision: null };
      document.commands[command.commandId] = entry;
      return { changed: true, result: entry };
    });
  }

  async pendingForHost(hostId: string, now = new Date()) {
    this.assertHost(hostId);
    const document = (await this.store.read(this.binding))?.document;
    return Object.values(document?.commands ?? {}).filter((entry) => entry.status === "pending" && new Date(entry.command.expiresAt) > now);
  }

  async acknowledge(hostId: string, commandId: string, input: { status: "applied" | "rejected"; receipt: string; appliedRevision: number | null }) {
    this.assertHost(hostId);
    return this.change((document) => {
      const entry = document.commands[commandId];
      if (!entry) throw new Error("STUDIO_COMMAND_NOT_FOUND");
      if (entry.status !== "pending") {
        if (entry.status !== input.status || entry.receipt !== input.receipt || entry.appliedRevision !== input.appliedRevision) throw new Error("STUDIO_ACK_CONFLICT");
        return { changed: false, result: entry };
      }
      const next: StudioStoredCommand = { ...entry, ...input };
      document.commands[commandId] = next;
      return { changed: true, result: next };
    });
  }

  async command(ownerId: string, commandId: string) {
    this.assertOwner(ownerId);
    return (await this.store.read(this.binding))?.document.commands[commandId] ?? null;
  }

  private assertOwner(ownerId: string) { if (ownerId !== this.binding.ownerId) throw new Error("STUDIO_OWNER_FORBIDDEN"); }
  private assertHost(hostId: string) { if (hostId !== this.binding.hostId) throw new Error("STUDIO_HOST_FORBIDDEN"); }
  private assertBinding(value: StudioHostBinding) {
    if (value.environmentId !== this.binding.environmentId || value.ownerId !== this.binding.ownerId || value.hostId !== this.binding.hostId) throw new Error("STUDIO_HOST_BINDING_MISMATCH");
  }
  private async change<T>(operation: (document: StudioDocument) => { changed: boolean; result: T }): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const current = await this.store.read(this.binding);
      const document = structuredClone(current?.document ?? initialDocument());
      const { changed, result } = operation(document);
      if (!changed) return result;
      if (await this.store.compareSwap(this.binding, current?.revision ?? 0, document)) return result;
    }
    throw new Error("STUDIO_CONCURRENT_WRITE_RETRY_EXHAUSTED");
  }
}
