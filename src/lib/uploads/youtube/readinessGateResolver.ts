import type { PlatformUploadSettings } from "@/lib/uploads/platformUploadTypes";
import type { YouTubeLocalTokenProviderStatus, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";

export type YouTubeReadinessGateResolutionStatus =
  | "pass"
  | "blocked"
  | "warning"
  | "not_configured"
  | "manual_required";

export type YouTubeReadinessGateResolution = {
  key: string;
  label_ko: string;
  status: YouTubeReadinessGateResolutionStatus;
  current_state_ko: string;
  why_blocked_ko: string;
  fix_hint_ko: string;
  config_source_ko: string;
  safe_details: string[];
  secret_safe: true;
};

export function buildYouTubeReadinessGateResolver(input: {
  readiness: YouTubeUploadReadiness;
  tokenReadiness: YouTubeLocalTokenProviderStatus;
  settings: PlatformUploadSettings;
}): YouTubeReadinessGateResolution[] {
  const { readiness, tokenReadiness, settings } = input;
  const providerConfigured = gate({
    key: "provider_ready",
    label_ko: "YouTube OAuth 제공자 설정",
    passed: readiness.configured,
    blockedStatus: "not_configured",
    current: readiness.configured
      ? "OAuth client and token provider are configured on the server."
      : "OAuth client or token provider configuration is incomplete.",
    why: "Server-side YouTube OAuth credentials and a token provider must be ready before upload.",
    fix: "Configure server-only YouTube OAuth credentials and YOUTUBE_TOKEN_FILE or YOUTUBE_LOCAL_TOKEN_FILE_PATH, then restart the server.",
    source: "Server env: YouTube OAuth client credentials, YOUTUBE_TOKEN_FILE, YOUTUBE_LOCAL_TOKEN_FILE_PATH",
    details: [
      `configured=${String(readiness.configured)}`,
      `token_file_path_configured=${String(tokenReadiness.token_file_path_configured)}`,
      `token_file_inside_repo=${String(tokenReadiness.token_file_inside_repo)}`
    ]
  });

  return [
    providerConfigured,
    gate({
      key: "quota_ready",
      label_ko: "YouTube 할당량 준비",
      passed: readiness.quota_ready,
      current: readiness.quota_ready ? "Quota readiness passed." : "Quota readiness is not confirmed.",
      why: "YouTube Data API quota or channel limits can block a private upload.",
      fix: "Confirm quota in Google Cloud Console and set YOUTUBE_QUOTA_READY=true.",
      source: "Server env: YOUTUBE_QUOTA_READY",
      details: [`quota_ready=${String(readiness.quota_ready)}`]
    }),
    gate({
      key: "account_ready",
      label_ko: "YouTube 계정/채널 준비",
      passed: readiness.account_ready,
      current: readiness.account_ready ? "Account/channel readiness passed." : "Account/channel readiness is not confirmed.",
      why: "Channel permissions, Studio access, and the selected brand account must be ready.",
      fix: "Confirm the target channel, upload permissions, and brand account selection, then set YOUTUBE_ACCOUNT_READY=true.",
      source: "Server env: YOUTUBE_ACCOUNT_READY",
      details: [`account_ready=${String(readiness.account_ready)}`]
    }),
    gate({
      key: "policy_ready",
      label_ko: "업로드 정책 준비",
      passed: readiness.policy_ready,
      current: readiness.policy_ready
        ? "Policy readiness and public-upload blocking passed."
        : "Policy readiness or public-upload blocking has not passed.",
      why: "Operators must confirm affiliate disclosure, private-only upload policy, and public upload blocking.",
      fix: "Confirm affiliate disclosure and private-only upload policy, then keep PUBLIC_UPLOAD_ENABLED=false and YOUTUBE_POLICY_READY=true.",
      source: "Server env: YOUTUBE_POLICY_READY, PUBLIC_UPLOAD_ENABLED=false",
      details: [`policy_ready=${String(readiness.policy_ready)}`, `public_upload_enabled=${String(settings.public_upload_enabled)}`]
    }),
    gate({
      key: "youtube_upload_enabled",
      label_ko: "YouTube 업로드 기능 플래그",
      passed: readiness.upload_enabled,
      current: readiness.upload_enabled ? "YouTube upload feature flag is enabled." : "YouTube upload feature flag is disabled.",
      why: "YouTube private execute remains disabled by default and must be explicitly enabled for the approved private path.",
      fix: "Set YOUTUBE_PRIVATE_UPLOAD_ENABLED=true for the approved private path, or use legacy YOUTUBE_UPLOAD_ENABLED=true only when intentionally retained.",
      source: "Server env: YOUTUBE_PRIVATE_UPLOAD_ENABLED or legacy YOUTUBE_UPLOAD_ENABLED",
      details: [`upload_enabled=${String(readiness.upload_enabled)}`]
    }),
    gate({
      key: "public_upload_blocked",
      label_ko: "공개 업로드 차단",
      passed: !settings.public_upload_enabled && !readiness.blocked_reasons.includes("public_upload_blocked"),
      current: settings.public_upload_enabled ? "Public upload is enabled." : "Public upload is blocked.",
      why: "Final execute allows private visibility only. Public and unlisted visibility are outside the approved execute scope.",
      fix: "Keep PUBLIC_UPLOAD_ENABLED=false and use visibility=private for execute.",
      source: "Server env and settings: PUBLIC_UPLOAD_ENABLED=false",
      details: [`public_upload_enabled=${String(settings.public_upload_enabled)}`]
    }),
    gate({
      key: "manual_upload_only",
      label_ko: "수동 검증 정책",
      passed: settings.manual_upload_only,
      current: settings.manual_upload_only ? "manual_upload_only=true." : "manual_upload_only=false.",
      why: "Studio results must be verified manually without automatic public conversion.",
      fix: "Keep manual_upload_only=true.",
      source: "Platform upload settings: manual_upload_only",
      details: [`manual_upload_only=${String(settings.manual_upload_only)}`]
    }),
    gate({
      key: "approval_required",
      label_ko: "정확한 승인 문구 필요",
      passed: settings.approval_required,
      current: settings.approval_required ? "Exact approval phrases are required." : "approval_required=false.",
      why: "Execute paths require explicit approval phrases to prevent accidental uploads.",
      fix: "Enter APPROVE_YOUTUBE_PRIVATE_UPLOAD for private execute. Enter RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE only for execution_intent=live_smoke.",
      source: "Platform upload settings: approval_required",
      details: [`approval_required=${String(settings.approval_required)}`]
    }),
    gate({
      key: "token_ready",
      label_ko: "업로드 토큰 준비",
      passed: readiness.token_ready,
      current: readiness.token_ready ? "Token metadata is ready." : "Token metadata is not ready.",
      why: "YouTube upload needs a valid local token file or server token provider.",
      fix: "Use the local OAuth helper to create and validate a token file outside the repo. Token values must not be shown in the UI.",
      source: "Server env and local provider metadata: YOUTUBE_TOKEN_FILE, YOUTUBE_LOCAL_TOKEN_FILE_PATH, YOUTUBE_TOKEN_READY",
      details: [
        `token_ready=${String(readiness.token_ready)}`,
        `token_file_exists=${String(tokenReadiness.token_file_exists)}`,
        `token_file_inside_repo=${String(tokenReadiness.token_file_inside_repo)}`
      ]
    }),
    gate({
      key: "scopes_ready",
      label_ko: "YouTube 업로드 권한 범위",
      passed: readiness.scopes_ready,
      current: readiness.scopes_ready ? "youtube.upload scope is confirmed." : "youtube.upload scope is not confirmed.",
      why: "videos.insert is rejected without the youtube.upload scope.",
      fix: "Confirm that the OAuth token includes youtube.upload and offline access.",
      source: "Server env and token metadata: YOUTUBE_SCOPES_READY, token scope metadata",
      details: [`scopes_ready=${String(readiness.scopes_ready)}`]
    }),
    manualGate({
      key: "candidate_ready",
      label_ko: "후보/업로드 입력 준비",
      current: "The dashboard form must provide candidate id, title, description, and affiliate link.",
      why: "The readiness resolver only checks server environment. Candidate input must be checked in the dashboard.",
      fix: "Enter candidate id, title, description, and affiliate link, then run prepare first.",
      source: "Dashboard form state",
      details: ["dashboard_form_required=true"]
    }),
    manualGate({
      key: "video_file_ready",
      label_ko: "영상 파일 준비",
      current: "The dashboard form must provide a local diagnostic path or prepared asset reference.",
      why: "The local video path is operator input, not server environment.",
      fix: "For domain readiness, provide a server-accessible prepared video asset reference.",
      source: "Dashboard form state",
      details: ["local_video_path_required=true"]
    }),
    manualGate({
      key: "disclosure_ready",
      label_ko: "제휴 고지 준비",
      current: "The dashboard form must provide readable UTF-8 affiliate disclosure text.",
      why: "Missing or garbled disclosure text blocks upload.",
      fix: "Enter normal Korean disclosure text that includes Coupang Partners and commission wording.",
      source: "Dashboard form disclosure guard",
      details: ["disclosure_guard_required=true"]
    }),
    manualGate({
      key: "prepare_ready",
      label_ko: "Prepare 사전 검증",
      current: "Run /api/uploads/youtube/prepare before execute.",
      why: "Prepare validates the upload request payload without calling YouTube.",
      fix: "Run prepare and confirm it passed.",
      source: "Dashboard prepare state",
      details: ["prepare_required_before_execute=true"]
    }),
    gate({
      key: "execute_ready",
      label_ko: "Execute 차단 게이트",
      passed: readiness.can_upload,
      current: readiness.can_upload ? "Server readiness allows execute." : "Server readiness blocks execute.",
      why: "All readiness gates and the exact approval phrase must pass before the server API may execute.",
      fix: readiness.can_upload
        ? "After prepare, use the exact approval phrase and execute only with visibility=private."
        : "Resolve the blocked readiness items above first.",
      source: "Server readiness aggregate: readiness.can_upload",
      details: [`can_upload=${String(readiness.can_upload)}`, `blocked_reasons_count=${String(readiness.blocked_reasons.length)}`]
    })
  ];
}

function gate(input: {
  key: string;
  label_ko: string;
  passed: boolean;
  current: string;
  why: string;
  fix: string;
  source: string;
  details: string[];
  blockedStatus?: YouTubeReadinessGateResolutionStatus;
}): YouTubeReadinessGateResolution {
  return {
    key: input.key,
    label_ko: input.label_ko,
    status: input.passed ? "pass" : input.blockedStatus ?? "blocked",
    current_state_ko: input.current,
    why_blocked_ko: input.passed ? "No current blocker for this gate." : input.why,
    fix_hint_ko: input.fix,
    config_source_ko: input.source,
    safe_details: input.details,
    secret_safe: true
  };
}

function manualGate(input: {
  key: string;
  label_ko: string;
  current: string;
  why: string;
  fix: string;
  source: string;
  details: string[];
}): YouTubeReadinessGateResolution {
  return {
    key: input.key,
    label_ko: input.label_ko,
    status: "manual_required",
    current_state_ko: input.current,
    why_blocked_ko: input.why,
    fix_hint_ko: input.fix,
    config_source_ko: input.source,
    safe_details: input.details,
    secret_safe: true
  };
}
