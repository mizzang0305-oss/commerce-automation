import "server-only";

import type { YouTubeUploadBlockedReason, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";
import { buildYouTubeTokenProviderReadiness } from "@/lib/uploads/youtube/youtubeTokenProviderContract";
import { readBooleanEnv } from "@/lib/uploads/youtube/youtubeUploadGuards";

export function buildYouTubeUploadReadiness(): YouTubeUploadReadiness {
  const hasClientId = Boolean(process.env.YOUTUBE_CLIENT_ID?.trim());
  const hasClientSecret = Boolean(process.env.YOUTUBE_CLIENT_SECRET?.trim());
  const tokenProvider = buildYouTubeTokenProviderReadiness();
  const upload_enabled = readBooleanEnv("YOUTUBE_UPLOAD_ENABLED");
  const publicUploadEnabled = readBooleanEnv("PUBLIC_UPLOAD_ENABLED");
  const token_ready = tokenProvider.token_ready;
  const scopes_ready = tokenProvider.scopes_ready;
  const quota_ready = tokenProvider.quota_ready;
  const account_ready = tokenProvider.account_ready;
  const policy_ready = tokenProvider.policy_ready && !publicUploadEnabled;
  const configured = hasClientId && hasClientSecret && tokenProvider.provider_configured;

  const blocked_reasons: YouTubeUploadBlockedReason[] = [];
  if (!configured) {
    blocked_reasons.push("provider_not_configured");
  }
  if (!token_ready) {
    blocked_reasons.push("token_not_ready");
  }
  if (!scopes_ready) {
    blocked_reasons.push("scopes_not_ready");
  }
  if (!quota_ready) {
    blocked_reasons.push("quota_not_ready");
  }
  if (!account_ready) {
    blocked_reasons.push("account_not_ready");
  }
  if (!policy_ready) {
    blocked_reasons.push("policy_not_ready");
  }
  if (!upload_enabled) {
    blocked_reasons.push("upload_disabled");
  }
  if (publicUploadEnabled) {
    blocked_reasons.push("public_upload_blocked");
  }

  return {
    provider: "youtube",
    configured,
    token_ready,
    scopes_ready,
    quota_ready,
    account_ready,
    policy_ready,
    upload_enabled,
    can_upload: blocked_reasons.length === 0,
    blocked_reasons
  };
}
