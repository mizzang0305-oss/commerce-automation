import { describe, expect, it, vi } from "vitest";
import { verifyV2AAuthenticatedChannelIdentity } from "../src/uploads/youtube/v2a/channelIdentity";

const target = `UC${"A".repeat(22)}`;
const other = `UC${"B".repeat(22)}`;

describe("YouTube Upload V2-A exact authenticated channel identity", () => {
  it("binds configured, operation-selected, and authenticated canonical IDs", async () => {
    const authorizedFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: target }] })
    }));
    await expect(verifyV2AAuthenticatedChannelIdentity({
      configuredTargetChannelId: target,
      operationSelectedChannelId: target,
      authorizedFetch
    })).resolves.toMatchObject({
      ok: true,
      authenticatedChannelId: target,
      probePerformed: true,
      secretsExposed: false
    });
    expect(authorizedFetch).toHaveBeenCalledWith("https://www.googleapis.com/youtube/v3/channels?part=id&mine=true");
  });

  it("rejects wrong channel and multiple managed channels fail closed", async () => {
    const wrongFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: other }] })
    }));
    await expect(verifyV2AAuthenticatedChannelIdentity({
      configuredTargetChannelId: target,
      operationSelectedChannelId: target,
      authorizedFetch: wrongFetch
    })).resolves.toMatchObject({ ok: false, code: "TARGET_CHANNEL_MISMATCH" });

    const ambiguousFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ id: target }, { id: other }] })
    }));
    await expect(verifyV2AAuthenticatedChannelIdentity({
      configuredTargetChannelId: target,
      operationSelectedChannelId: target,
      authorizedFetch: ambiguousFetch
    })).resolves.toMatchObject({ ok: false, code: "AUTHENTICATED_CHANNEL_AMBIGUOUS" });
  });

  it("does not call the provider when configured and operation channel IDs disagree", async () => {
    const authorizedFetch = vi.fn();
    await expect(verifyV2AAuthenticatedChannelIdentity({
      configuredTargetChannelId: target,
      operationSelectedChannelId: other,
      authorizedFetch
    })).resolves.toMatchObject({ ok: false, code: "TARGET_CHANNEL_MISMATCH", probePerformed: false });
    expect(authorizedFetch).not.toHaveBeenCalled();
  });
});
