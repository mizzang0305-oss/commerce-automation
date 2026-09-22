import { createHash } from "node:crypto";
import { snapshotEnvelopeSchema, studioCommandSchema, type StudioCommand, type StudioSnapshot, type StudioSnapshotPayload } from "./contracts";

type HostBinding = { environmentId: string; ownerId: string; hostId: string };
type StoredSnapshot = { envelope: StudioSnapshot; receivedAt: string; payload: StudioSnapshotPayload };
type CommandStatus = "pending" | "applying" | "applied" | "rejected" | "expired";
export type StoredCommand = { command: StudioCommand; status: CommandStatus; receipt: string | null; appliedRevision: number | null };

/** Fixture store only. Cloud/runtime use must supply a durable implementation. */
export class InMemoryStudioBridge {
  private snapshot: StoredSnapshot | null = null;
  private events = new Map<string, string>();
  private commands = new Map<string, StoredCommand>();
  private pending: Promise<void> = Promise.resolve();
  constructor(private readonly host: HostBinding) {}

  async ingest(raw: unknown, receivedAt = new Date().toISOString()) {
    return this.exclusive(() => {
      const envelope = snapshotEnvelopeSchema.parse(raw);
      this.assertHost(envelope);
      const hash = createHash("sha256").update(JSON.stringify(envelope)).digest("hex");
      const previousHash = this.events.get(envelope.eventId);
      if (previousHash) {
        if (previousHash !== hash) throw new Error("STUDIO_EVENT_ID_COLLISION");
        return { status: "duplicate" as const };
      }
      if (this.snapshot && envelope.sourceSequence <= this.snapshot.envelope.sourceSequence) throw new Error("STUDIO_SOURCE_SEQUENCE_STALE");
      const previous = this.snapshot?.payload;
      const payload = {
        producer: envelope.completeness.producer ? envelope.payload.producer : previous?.producer ?? null,
        publisher: envelope.completeness.publisher ? envelope.payload.publisher : previous?.publisher ?? null,
        plans: envelope.completeness.plans ? envelope.payload.plans : previous?.plans ?? null,
        candidates: envelope.completeness.candidates ? envelope.payload.candidates : previous?.candidates ?? null
      };
      this.snapshot = { envelope, receivedAt, payload };
      this.events.set(envelope.eventId, hash);
      return { status: "accepted" as const };
    });
  }

  read(ownerId: string) {
    if (ownerId !== this.host.ownerId) throw new Error("STUDIO_OWNER_FORBIDDEN");
    return this.snapshot ? structuredClone(this.snapshot) : null;
  }

  async enqueue(raw: unknown, ownerId: string) {
    return this.exclusive(() => {
      const command = studioCommandSchema.parse(raw);
      if (ownerId !== this.host.ownerId || command.ownerId !== ownerId) throw new Error("STUDIO_OWNER_FORBIDDEN");
      this.assertHost(command);
      if (new Date(command.expiresAt).getTime() <= new Date(command.requestedAt).getTime()) throw new Error("STUDIO_COMMAND_EXPIRY_INVALID");
      const existing = this.commands.get(command.commandId);
      if (existing) {
        if (JSON.stringify(existing.command) !== JSON.stringify(command)) throw new Error("STUDIO_COMMAND_ID_COLLISION");
        return structuredClone(existing);
      }
      const stored: StoredCommand = { command, status: "pending", receipt: null, appliedRevision: null };
      this.commands.set(command.commandId, stored);
      return structuredClone(stored);
    });
  }

  pendingForHost(hostId: string, now = new Date()) {
    if (hostId !== this.host.hostId) throw new Error("STUDIO_HOST_FORBIDDEN");
    return [...this.commands.values()].filter((entry) => entry.status === "pending" && new Date(entry.command.expiresAt) > now)
      .map((entry) => structuredClone(entry));
  }

  async acknowledge(hostId: string, commandId: string, input: { status: "applied" | "rejected"; receipt: string; appliedRevision: number | null }) {
    return this.exclusive(() => {
      if (hostId !== this.host.hostId) throw new Error("STUDIO_HOST_FORBIDDEN");
      const entry = this.commands.get(commandId);
      if (!entry) throw new Error("STUDIO_COMMAND_NOT_FOUND");
      if (entry.status === "applied" || entry.status === "rejected") {
        if (entry.status !== input.status || entry.receipt !== input.receipt || entry.appliedRevision !== input.appliedRevision) throw new Error("STUDIO_ACK_CONFLICT");
        return structuredClone(entry);
      }
      entry.status = input.status;
      entry.receipt = input.receipt;
      entry.appliedRevision = input.appliedRevision;
      return structuredClone(entry);
    });
  }

  command(ownerId: string, commandId: string) {
    if (ownerId !== this.host.ownerId) throw new Error("STUDIO_OWNER_FORBIDDEN");
    const entry = this.commands.get(commandId);
    return entry ? structuredClone(entry) : null;
  }

  private assertHost(value: HostBinding) {
    if (value.environmentId !== this.host.environmentId || value.ownerId !== this.host.ownerId || value.hostId !== this.host.hostId) throw new Error("STUDIO_HOST_BINDING_MISMATCH");
  }

  private async exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.pending;
    let release: () => void = () => undefined;
    this.pending = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await operation(); } finally { release(); }
  }
}
