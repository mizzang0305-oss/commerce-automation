import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";

export type YouTubeUploadVisibility = "private" | "unlisted";
export type YouTubeExecutionIntent = "private_execute" | "live_smoke";

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
  | "upload_confirmation_missing"
  | "private_execute_approval_missing"
  | "live_smoke_approval_missing"
  | "visibility_public_blocked"
  | "visibility_unlisted_blocked"
  | "visibility_private_required";

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
  prepared_video_asset: PreparedVideoAssetRef;
  video_path_or_url: string;
  title: string;
  description: string;
  tags: string[];
  category_id?: string;
  visibility: YouTubeUploadVisibility;
  execution_intent: YouTubeExecutionIntent;
  disclosure_text: string;
  selected_affiliate_url: string;
  shorts_content_quality?: unknown;
  smoke_approval?: string;
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
  token_refresh_attempted?: boolean;
  token_refresh_succeeded?: boolean;
  token_file_updated?: boolean;
  token_file_update_warning?: string;
  resumable_session_attempted?: boolean;
  reauth_required?: boolean;
}

export interface YouTubeUploadAdapter {
  upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult>;
}

export interface YouTubeLocalTokenProviderStatus {
  configured: boolean;
  token_file_path_configured: boolean;
  token_file_inside_repo: boolean;
  token_file_gitignored_or_outside_repo: boolean;
  token_file_exists: boolean;
  token_ready: boolean;
  scopes_ready: boolean;
  safe_summary: string;
  blocked_reasons: string[];
}

export type YouTubeUploadRequestInput = {
  candidate_id?: unknown;
  prepared_video_asset?: unknown;
  asset_id?: unknown;
  storage_key?: unknown;
  signed_url?: unknown;
  prepared_video_asset_url?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
  checksum_sha256?: unknown;
  sha256?: unknown;
  expires_at?: unknown;
  provider?: unknown;
  source?: unknown;
  asset_provider?: unknown;
  server_accessible?: unknown;
  video_path_or_url?: unknown;
  title?: unknown;
  description?: unknown;
  caption?: unknown;
  tags?: unknown;
  category_id?: unknown;
  visibility?: unknown;
  execution_intent?: unknown;
  upload_intent?: unknown;
  disclosure_text?: unknown;
  selected_affiliate_url?: unknown;
  shorts_content_quality?: unknown;
  smoke_approval?: unknown;
  smokeApproval?: unknown;
};
