const YOUTUBE_CHANNELS_MINE_URL = "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true";
const CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

export type V2AAuthorizedChannelFetch = (
  url: typeof YOUTUBE_CHANNELS_MINE_URL
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type V2AChannelIdentityResult =
  | {
      ok: true;
      configuredTargetChannelId: string;
      operationSelectedChannelId: string;
      authenticatedChannelId: string;
      probePerformed: true;
      secretsExposed: false;
    }
  | {
      ok: false;
      code:
        | "TARGET_CHANNEL_ID_INVALID"
        | "OPERATION_CHANNEL_ID_INVALID"
        | "AUTHENTICATED_CHANNEL_PROBE_FAILED"
        | "AUTHENTICATED_CHANNEL_ID_INVALID"
        | "AUTHENTICATED_CHANNEL_AMBIGUOUS"
        | "TARGET_CHANNEL_MISMATCH";
      probePerformed: boolean;
      secretsExposed: false;
    };

export async function verifyV2AAuthenticatedChannelIdentity(input: {
  configuredTargetChannelId: string;
  operationSelectedChannelId: string;
  authorizedFetch: V2AAuthorizedChannelFetch;
}): Promise<V2AChannelIdentityResult> {
  if (!CHANNEL_ID_PATTERN.test(input.configuredTargetChannelId)) {
    return failed("TARGET_CHANNEL_ID_INVALID", false);
  }
  if (!CHANNEL_ID_PATTERN.test(input.operationSelectedChannelId)) {
    return failed("OPERATION_CHANNEL_ID_INVALID", false);
  }
  if (input.configuredTargetChannelId !== input.operationSelectedChannelId) {
    return failed("TARGET_CHANNEL_MISMATCH", false);
  }

  let response: Awaited<ReturnType<V2AAuthorizedChannelFetch>>;
  try {
    response = await input.authorizedFetch(YOUTUBE_CHANNELS_MINE_URL);
  } catch {
    return failed("AUTHENTICATED_CHANNEL_PROBE_FAILED", true);
  }
  if (!response.ok) return failed("AUTHENTICATED_CHANNEL_PROBE_FAILED", true);

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return failed("AUTHENTICATED_CHANNEL_PROBE_FAILED", true);
  }
  if (!isRecord(payload) || !Array.isArray(payload.items)) {
    return failed("AUTHENTICATED_CHANNEL_PROBE_FAILED", true);
  }
  if (payload.items.length !== 1) {
    return failed("AUTHENTICATED_CHANNEL_AMBIGUOUS", true);
  }
  const item = payload.items[0];
  const authenticatedChannelId = isRecord(item) && typeof item.id === "string" ? item.id : "";
  if (!CHANNEL_ID_PATTERN.test(authenticatedChannelId)) {
    return failed("AUTHENTICATED_CHANNEL_ID_INVALID", true);
  }
  if (authenticatedChannelId !== input.configuredTargetChannelId) {
    return failed("TARGET_CHANNEL_MISMATCH", true);
  }
  return {
    ok: true,
    configuredTargetChannelId: input.configuredTargetChannelId,
    operationSelectedChannelId: input.operationSelectedChannelId,
    authenticatedChannelId,
    probePerformed: true,
    secretsExposed: false
  };
}

function failed(code: Extract<V2AChannelIdentityResult, { ok: false }>["code"], probePerformed: boolean): V2AChannelIdentityResult {
  return { ok: false, code, probePerformed, secretsExposed: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
