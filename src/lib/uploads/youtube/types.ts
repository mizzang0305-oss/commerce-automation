export type YouTubeUploadVisibility = "private" | "unlisted";

export type YouTubeUploadBlockedReason =
  | "provider_not_configured"
  | "token_not_ready"
  | "scopes_not_ready"
  | "quota_not_ready"
  | "account_not_ready"
  | "policy_not_ready"
  | "upload_disabled"
  | "public_upload_blocked"
  | "confirmation_required"
  | "live_smoke_approval_missing";

export interface YouTubeUploadReadiness {
  provider: "youtube";
  configured: boolean;
  token_ready: boolean;
  scopes_ready: boolean;
  quota_ready: boolean;
  account_ready: boolean;
  policy_ready: boolean;
  upload_enabled: boolean;
  can_upload: boolean;
  blocked_reasons: YouTubeUploadBlockedReason[];
}

export interface YouTubeUploadRequest {
  provider: "youtube";
  candidate_id: string;
  video_path_or_url: string;
  title: string;
  description: string;
  tags: string[];
  category_id?: string;
  visibility: YouTubeUploadVisibility;
  disclosure_text: string;
  selected_affiliate_url: string;
  made_for_kids: false;
  self_declared_made_for_kids: false;
}

export interface YouTubeUploadSideEffects {
  external_api_called: boolean;
  youtube_upload_executed: boolean;
  uploaded: boolean;
  db_written: false;
  r2_uploaded: false;
  queue_created: false;
  worker_job_created: false;
  platform_upload_triggered: boolean;
  public_upload_enabled: false;
}

export interface YouTubeUploadResult {
  provider: "youtube";
  attempted: boolean;
  succeeded: boolean;
  youtube_video_id?: string;
  youtube_url?: string;
  visibility: YouTubeUploadVisibility;
  safe_message: string;
  blocked_reasons: string[];
  side_effects: YouTubeUploadSideEffects;
  approval_required: true;
}

export interface YouTubeUploadAdapter {
  upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult>;
}

export type YouTubeUploadRequestInput = {
  candidate_id?: unknown;
  video_path_or_url?: unknown;
  title?: unknown;
  description?: unknown;
  caption?: unknown;
  tags?: unknown;
  category_id?: unknown;
  visibility?: unknown;
  disclosure_text?: unknown;
  selected_affiliate_url?: unknown;
};
