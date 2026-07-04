import crypto from "node:crypto";

export type YouTubeChannelIdSanitizedEvidence = {
  present: boolean;
  format_valid: boolean;
  hash_prefix: string | null;
  raw_channel_ids_printed: false;
};

const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[A-Za-z0-9_-]{22}$/;

export function validateYouTubeChannelId(value: unknown): YouTubeChannelIdSanitizedEvidence {
  const channelId = typeof value === "string" ? value.trim() : "";
  return {
    present: Boolean(channelId),
    format_valid: YOUTUBE_CHANNEL_ID_PATTERN.test(channelId),
    hash_prefix: channelId ? crypto.createHash("sha256").update(channelId).digest("hex").slice(0, 10) : null,
    raw_channel_ids_printed: false
  };
}
