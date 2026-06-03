import type { ChannelProfile, JsonRecord } from "@/types/automation";

export type ChannelProfilePatch = Partial<Pick<
  ChannelProfile,
  | "channel_name"
  | "youtube_channel_id"
  | "youtube_handle"
  | "niche"
  | "allowed_categories"
  | "excluded_categories"
  | "default_hashtags"
  | "title_template"
  | "description_template"
  | "hashtag_template"
  | "pinned_comment_template"
  | "upload_window"
  | "status"
>>;

export type YouTubeChannelReadiness = {
  oauth_configured: boolean;
  upload_enabled: false;
  manual_upload_only: true;
};

const TOKEN_FIELD_PATTERN = /(token|secret|authorization|credential|password)/i;

export function normalizeChannelProfile(profile: ChannelProfile): ChannelProfile {
  return {
    ...profile,
    allowed_categories: normalizeStringArray(profile.allowed_categories),
    excluded_categories: normalizeStringArray(profile.excluded_categories),
    default_hashtags: normalizeStringArray(profile.default_hashtags).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)),
    title_template: profile.title_template ?? "",
    description_template: profile.description_template ?? "",
    hashtag_template: profile.hashtag_template ?? "",
    pinned_comment_template: profile.pinned_comment_template ?? "",
    upload_window: normalizeUploadWindow(profile.upload_window),
    upload_enabled: false,
    manual_upload_only: true
  };
}

export function sanitizeChannelProfilePatch(input: Record<string, unknown>): ChannelProfilePatch {
  const patch: ChannelProfilePatch = {};

  for (const key of Object.keys(input)) {
    if (TOKEN_FIELD_PATTERN.test(key)) {
      continue;
    }
  }

  assignTrimmed(input, patch, "channel_name");
  assignTrimmed(input, patch, "youtube_channel_id");
  assignTrimmed(input, patch, "youtube_handle");
  assignTrimmed(input, patch, "niche");
  assignTrimmed(input, patch, "title_template");
  assignTrimmed(input, patch, "description_template");
  assignTrimmed(input, patch, "hashtag_template");
  assignTrimmed(input, patch, "pinned_comment_template");

  if (input.status === "active" || input.status === "paused" || input.status === "archived") {
    patch.status = input.status;
  }
  if (Array.isArray(input.allowed_categories)) {
    patch.allowed_categories = normalizeStringArray(input.allowed_categories);
  }
  if (Array.isArray(input.excluded_categories)) {
    patch.excluded_categories = normalizeStringArray(input.excluded_categories);
  }
  if (Array.isArray(input.default_hashtags)) {
    patch.default_hashtags = normalizeStringArray(input.default_hashtags).map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
  }
  if (input.upload_window && typeof input.upload_window === "object" && !Array.isArray(input.upload_window)) {
    patch.upload_window = normalizeUploadWindow(input.upload_window as JsonRecord);
  }

  return patch;
}

export function getYouTubeChannelReadiness(env: NodeJS.ProcessEnv = process.env): YouTubeChannelReadiness {
  return {
    oauth_configured: Boolean(env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REDIRECT_URI),
    upload_enabled: false,
    manual_upload_only: true
  };
}

function assignTrimmed<T extends keyof ChannelProfilePatch>(
  input: Record<string, unknown>,
  patch: ChannelProfilePatch,
  key: T
) {
  const value = input[key];
  if (typeof value === "string") {
    patch[key] = value.trim() as ChannelProfilePatch[T];
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)));
}

function normalizeUploadWindow(value: JsonRecord): JsonRecord {
  const startHour = normalizeHour(value.start_hour, 9);
  const endHour = normalizeHour(value.end_hour, 21);
  return {
    start_hour: startHour,
    end_hour: endHour
  };
}

function normalizeHour(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : fallback;
  if (!Number.isInteger(parsed)) {
    return fallback;
  }
  return Math.min(23, Math.max(0, parsed));
}
