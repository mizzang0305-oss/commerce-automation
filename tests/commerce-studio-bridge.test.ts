import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { allowedStudioOwner, sameStudioOrigin, studioAuthConfig, verifiedGoogleIdentityForEmail } from "@/lib/commerce-studio/auth/config";
import { InMemoryStudioBridge } from "@/lib/commerce-studio/bridge/memoryStore";
import { signStudioHostRequest, verifyStudioHostRequest } from "@/lib/commerce-studio/bridge/hostAuth";

const host = { ownerId: "google-sub-owner", environmentId: "isolated", hostId: "host-fixture" };
const emptyPayload = { producer: null, publisher: null, plans: null, candidates: null };
const completeness = { producer: false, publisher: false, plans: false, candidates: false };
const snapshot = (sequence: number, eventId = randomUUID()) => ({
  schemaVersion: 1, ...host, sourceRuntimeSha: "a".repeat(40), sourceSequence: sequence,
  eventId, observedAt: "2026-09-23T00:00:00.000Z", sourceRevision: "rev-1", completeness, payload: emptyPayload
});

describe("Studio owner boundary", () => {
  it("requires configuration and a verified allowlisted Google identity", () => {
    expect(studioAuthConfig({} as NodeJS.ProcessEnv).ready).toBe(false);
    const allowed = new Set(["google-sub-owner"]);
    expect(allowedStudioOwner({ email: "owner@example.com", identities: [{ provider: "google", identity_data: { sub: "google-sub-owner", email: "owner@example.com", email_verified: true } }] }, allowed)?.ownerId).toBe("google-sub-owner");
    expect(allowedStudioOwner({ email: "owner@example.com", identities: [{ provider: "google", identity_data: { sub: "different", email: "owner@example.com", email_verified: true } }] }, allowed)).toBeNull();
    expect(allowedStudioOwner({ email: "owner@example.com", identities: [{ provider: "google", identity_data: { sub: "google-sub-owner", email: "owner@example.com", email_verified: false } }] }, allowed)).toBeNull();
  });

  it("rejects cross-origin mutations", () => {
    const request = new Request("https://studio.example/api/studio/control", { method: "POST", headers: { origin: "https://attacker.example" } });
    expect(sameStudioOrigin(request, "https://studio.example")).toBe(false);
  });

  it("verifies only the approved email's Google identity without granting owner access", () => {
    const user = { email: "owner@example.com", identities: [
      { provider: "google", identity_data: { sub: "other", email: "other@example.com", email_verified: true } },
      { provider: "google", identity_data: { sub: "approved", email: "owner@example.com", email_verified: true } }
    ] };
    expect(verifiedGoogleIdentityForEmail(user, "owner@example.com")?.ownerId).toBe("approved");
    expect(verifiedGoogleIdentityForEmail(user, "someone@example.com")).toBeNull();
    expect(allowedStudioOwner(user, new Set(["other"]))).toBeNull();
    expect(allowedStudioOwner(user, new Set(["approved"]))?.ownerId).toBe("approved");
    expect(verifiedGoogleIdentityForEmail({ email: "owner@example.com", identities: [
      { provider: "google", identity_data: { sub: "approved", email: "owner@example.com", email_verified: false } }
    ] }, "owner@example.com")).toBeNull();
  });
});

describe("isolated Studio snapshot and command bridge", () => {
  it("preserves last-good sections and distinguishes unavailable from verified empty", async () => {
    const bridge = new InMemoryStudioBridge(host);
    expect(bridge.read(host.ownerId)).toBeNull();
    const first = { ...snapshot(1), completeness: { ...completeness, publisher: true }, payload: { ...emptyPayload, publisher: { jobs: [], ledger: [] } } };
    expect((await bridge.ingest(first)).status).toBe("accepted");
    expect(bridge.read(host.ownerId)?.payload.publisher).toEqual({ jobs: [], ledger: [] });
    await bridge.ingest(snapshot(2));
    expect(bridge.read(host.ownerId)?.payload.publisher).toEqual({ jobs: [], ledger: [] });
    expect(bridge.read(host.ownerId)?.envelope.observedAt).toBe("2026-09-23T00:00:00.000Z");
  });

  it("replays identical event safely and rejects changed event, stale sequence and another host", async () => {
    const bridge = new InMemoryStudioBridge(host);
    const first = snapshot(1);
    await bridge.ingest(first);
    expect((await bridge.ingest(first)).status).toBe("duplicate");
    await expect(bridge.ingest({ ...first, sourceRevision: "different" })).rejects.toThrow("STUDIO_EVENT_ID_COLLISION");
    await expect(bridge.ingest(snapshot(1))).rejects.toThrow("STUDIO_SOURCE_SEQUENCE_STALE");
    await expect(bridge.ingest({ ...snapshot(2), hostId: "other-host" })).rejects.toThrow("STUDIO_HOST_BINDING_MISMATCH");
    expect(() => bridge.read("different-owner")).toThrow("STUDIO_OWNER_FORBIDDEN");
  });

  it("keeps pending command separate from applied ACK and rejects conflicting replay", async () => {
    const bridge = new InMemoryStudioBridge(host);
    const command = {
      commandId: randomUUID(), ...host, type: "SELECT_PRODUCT", targetId: "2026-09-24|09:00", expectedVersion: 0,
      requestedAt: "2026-09-23T00:00:00.000Z", expiresAt: "2026-09-24T00:00:00.000Z",
      payload: { candidateSnapshotId: "candidate-B", productId: "product-B" }
    };
    expect((await bridge.enqueue(command, host.ownerId)).status).toBe("pending");
    expect(bridge.pendingForHost(host.hostId, new Date("2026-09-23T01:00:00.000Z"))).toHaveLength(1);
    const ack = { status: "applied" as const, receipt: "ack-B", appliedRevision: 1 };
    expect((await bridge.acknowledge(host.hostId, command.commandId, ack)).status).toBe("applied");
    expect((await bridge.acknowledge(host.hostId, command.commandId, ack)).receipt).toBe("ack-B");
    await expect(bridge.acknowledge(host.hostId, command.commandId, { ...ack, receipt: "changed" })).rejects.toThrow("STUDIO_ACK_CONFLICT");
    expect(bridge.pendingForHost(host.hostId)).toHaveLength(0);
  });

  it("binds host signature to path, body, nonce and time", () => {
    const input = { secret: "isolated-secret", hostId: host.hostId, method: "POST", pathname: "/api/studio-host/snapshot", body: "{}", timestamp: "2026-09-23T00:00:00.000Z", nonce: randomUUID() };
    const headers = signStudioHostRequest(input);
    expect(verifyStudioHostRequest({ ...input, expectedHostId: host.hostId, headers, now: new Date(input.timestamp) })).toBe(true);
    expect(verifyStudioHostRequest({ ...input, body: "{\"changed\":true}", expectedHostId: host.hostId, headers, now: new Date(input.timestamp) })).toBe(false);
    expect(verifyStudioHostRequest({ ...input, expectedHostId: host.hostId, headers, now: new Date("2026-09-23T00:06:00.000Z") })).toBe(false);
  });
});
