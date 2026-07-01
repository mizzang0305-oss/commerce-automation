import type { ChannelKey } from "./channelProfiles";

const YOUTUBE_CHANNELS_MINE_URL =
  "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";

export type AuthenticatedChannelProbeBlocker =
  | "BLOCKED_AUTHENTICATED_CHANNEL_PROBE_MISSING";

export type AuthenticatedChannelProbeResult =
  | {
    ok: true;
    channel_key: ChannelKey;
    upload_account_alias: string;
    authenticated_channel_id: string;
    probe_performed: true;
    raw_token_printed: false;
    secrets_printed: false;
    blocker: null;
  }
  | {
    ok: false;
    channel_key: ChannelKey;
    upload_account_alias: string;
    authenticated_channel_id: null;
    probe_performed: true;
    raw_token_printed: false;
    secrets_printed: false;
    blocker: AuthenticatedChannelProbeBlocker;
  };

export async function buildAuthenticatedChannelProbe(input: {
  channelKey: ChannelKey;
  uploadAccountAlias: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<AuthenticatedChannelProbeResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(YOUTUBE_CHANNELS_MINE_URL, {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${input.accessToken}`
    })
  });
  const payload = await safeJson(response);
  const authenticatedChannelId = extractAuthenticatedChannelId(payload);
  if (!response.ok || !authenticatedChannelId) {
    return {
      ok: false,
      channel_key: input.channelKey,
      upload_account_alias: input.uploadAccountAlias,
      authenticated_channel_id: null,
      probe_performed: true,
      raw_token_printed: false,
      secrets_printed: false,
      blocker: "BLOCKED_AUTHENTICATED_CHANNEL_PROBE_MISSING"
    };
  }

  return {
    ok: true,
    channel_key: input.channelKey,
    upload_account_alias: input.uploadAccountAlias,
    authenticated_channel_id: authenticatedChannelId,
    probe_performed: true,
    raw_token_printed: false,
    secrets_printed: false,
    blocker: null
  };
}

function extractAuthenticatedChannelId(payload: Record<string, unknown>) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const first = items[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return "";
  }
  const id = (first as Record<string, unknown>).id;
  return typeof id === "string" ? id.trim() : "";
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
