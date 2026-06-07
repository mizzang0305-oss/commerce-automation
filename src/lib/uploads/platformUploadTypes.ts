import type { Platform, ProductCandidate } from "@/types/automation";

export type PlatformUploadProvider = Platform;

export type PlatformUploadVisibility = "private" | "unlisted";

export type PlatformUploadSettings = {
  youtube_upload_enabled: false;
  tiktok_upload_enabled: false;
  threads_upload_enabled: false;
  manual_upload_only: true;
  public_upload_enabled: false;
  approval_required: true;
  default_visibility: PlatformUploadVisibility;
  max_daily_uploads: number;
};

export type PlatformUploadBlockedReason =
  | "provider_not_configured"
  | "token_not_ready"
  | "scopes_not_ready"
  | "quota_not_ready"
  | "account_not_ready"
  | "policy_not_ready"
  | "upload_disabled"
  | "manual_upload_only";

export type PlatformUploadReadiness = {
  provider: PlatformUploadProvider;
  configured: boolean;
  token_ready: boolean;
  scopes_ready: boolean;
  quota_ready: boolean;
  account_ready: boolean;
  policy_ready: boolean;
  upload_enabled: boolean;
  can_upload: boolean;
  blocked_reasons: PlatformUploadBlockedReason[];
};

export type PlatformUploadSideEffects = {
  uploaded: false;
  platform_api_called: false;
  token_exchanged: false;
  token_stored: false;
  db_written: false;
  queue_created: false;
  worker_job_created: false;
  upload_package_created: false;
};

export type PlatformUploadJobPlan = {
  id: string;
  candidate_id: string;
  product_name: string;
  video_path_or_url: string;
  title: string;
  description: string;
  caption: string;
  disclosure_text: string;
  selected_affiliate_url: string;
  provider_targets: PlatformUploadProvider[];
  visibility: PlatformUploadVisibility;
  manual_upload_only: true;
  public_upload_enabled: false;
  approval_required: true;
  readiness: PlatformUploadReadiness[];
  side_effects: PlatformUploadSideEffects;
  created_at: string;
};

export type PlatformUploadPlanInput = {
  candidate: ProductCandidate;
  video_path_or_url?: unknown;
  title?: unknown;
  description?: unknown;
  caption?: unknown;
  disclosure_text?: unknown;
  provider_targets?: unknown;
  visibility?: unknown;
  now?: string;
};
