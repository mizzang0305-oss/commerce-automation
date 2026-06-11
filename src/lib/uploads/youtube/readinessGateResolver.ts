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
      ? "OAuth client와 token provider 설정이 서버에서 확인되었습니다."
      : "OAuth client 또는 token provider 설정이 아직 부족합니다.",
    why: "YouTube API 호출 전에 서버 전용 OAuth 설정과 token provider가 모두 준비되어야 합니다.",
    fix: "서버 전용 YouTube OAuth client credentials와 YOUTUBE_TOKEN_FILE 또는 YOUTUBE_LOCAL_TOKEN_FILE_PATH를 설정한 뒤 서버를 재시작하세요.",
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
      current: readiness.quota_ready ? "할당량 readiness 플래그가 통과했습니다." : "할당량 readiness 플래그가 통과하지 않았습니다.",
      why: "YouTube Data API quota가 부족하면 private smoke도 실패하거나 계정 제한에 걸릴 수 있습니다.",
      fix: "Google Cloud Console에서 YouTube Data API quota와 프로젝트 제한을 확인한 뒤 YOUTUBE_QUOTA_READY=true로 명시하세요.",
      source: "Server env: YOUTUBE_QUOTA_READY",
      details: [`quota_ready=${String(readiness.quota_ready)}`]
    }),
    gate({
      key: "account_ready",
      label_ko: "YouTube 계정/채널 준비",
      passed: readiness.account_ready,
      current: readiness.account_ready ? "업로드 대상 계정/채널 readiness가 통과했습니다." : "업로드 대상 계정/채널 readiness가 통과하지 않았습니다.",
      why: "채널 권한, Studio 접근, 브랜드 계정 선택이 준비되지 않으면 업로드가 실패할 수 있습니다.",
      fix: "YouTube Studio에서 대상 채널, 업로드 권한, 브랜드 계정 선택을 확인한 뒤 YOUTUBE_ACCOUNT_READY=true로 명시하세요.",
      source: "Server env: YOUTUBE_ACCOUNT_READY",
      details: [`account_ready=${String(readiness.account_ready)}`]
    }),
    gate({
      key: "policy_ready",
      label_ko: "업로드 정책 준비",
      passed: readiness.policy_ready,
      current: readiness.policy_ready
        ? "정책 readiness와 public upload 차단 조건이 통과했습니다."
        : "정책 readiness가 부족하거나 public upload 차단 조건이 통과하지 않았습니다.",
      why: "제휴 고지, 비공개/일부 공개 smoke 정책, public upload 차단 상태를 운영자가 확인해야 합니다.",
      fix: "제휴 고지와 private/unlisted 정책을 확인하고 PUBLIC_UPLOAD_ENABLED=false, YOUTUBE_POLICY_READY=true를 유지하세요.",
      source: "Server env: YOUTUBE_POLICY_READY, PUBLIC_UPLOAD_ENABLED=false",
      details: [`policy_ready=${String(readiness.policy_ready)}`, `public_upload_enabled=${String(settings.public_upload_enabled)}`]
    }),
    gate({
      key: "youtube_upload_enabled",
      label_ko: "YouTube 업로드 기능 플래그",
      passed: readiness.upload_enabled,
      current: readiness.upload_enabled ? "YouTube upload feature flag가 켜져 있습니다." : "YouTube upload feature flag가 꺼져 있습니다.",
      why: "기본값은 안전하게 disabled입니다. private smoke 승인 시에만 명시적으로 켜야 합니다.",
      fix: "승인된 로컬 private smoke 환경에서만 YOUTUBE_UPLOAD_ENABLED=true로 설정하세요. production 기본값은 false입니다.",
      source: "Server env: YOUTUBE_UPLOAD_ENABLED",
      details: [`upload_enabled=${String(readiness.upload_enabled)}`]
    }),
    gate({
      key: "public_upload_blocked",
      label_ko: "공개 업로드 차단",
      passed: !settings.public_upload_enabled && !readiness.blocked_reasons.includes("public_upload_blocked"),
      current: settings.public_upload_enabled ? "public upload가 켜져 있습니다." : "public upload가 차단되어 있습니다.",
      why: "이번 smoke는 private/unlisted만 허용합니다. public visibility는 승인 범위 밖입니다.",
      fix: "PUBLIC_UPLOAD_ENABLED=false를 유지하고 UI visibility도 private 또는 unlisted만 사용하세요.",
      source: "Server env and settings: PUBLIC_UPLOAD_ENABLED=false",
      details: [`public_upload_enabled=${String(settings.public_upload_enabled)}`]
    }),
    gate({
      key: "manual_upload_only",
      label_ko: "수동 검증 정책",
      passed: settings.manual_upload_only,
      current: settings.manual_upload_only ? "manual_upload_only=true입니다." : "manual_upload_only=false입니다.",
      why: "자동 공개 전환 없이 Studio에서 결과를 직접 검증해야 합니다.",
      fix: "manual_upload_only=true를 유지하세요.",
      source: "Platform upload settings: manual_upload_only",
      details: [`manual_upload_only=${String(settings.manual_upload_only)}`]
    }),
    gate({
      key: "approval_required",
      label_ko: "정확한 승인 문구 필요",
      passed: settings.approval_required,
      current: settings.approval_required ? "정확한 승인 문구 입력이 필요합니다." : "approval_required=false입니다.",
      why: "실수로 upload execute가 호출되지 않도록 두 개의 승인 문구를 요구합니다.",
      fix: "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE와 APPROVE_YOUTUBE_PRIVATE_UPLOAD를 화면에 직접 입력해야 합니다.",
      source: "Platform upload settings: approval_required",
      details: [`approval_required=${String(settings.approval_required)}`]
    }),
    gate({
      key: "token_ready",
      label_ko: "업로드 토큰 준비",
      passed: readiness.token_ready,
      current: readiness.token_ready ? "토큰 메타데이터가 준비되었습니다." : "토큰 메타데이터가 준비되지 않았습니다.",
      why: "YouTube upload에는 유효한 로컬 token file 또는 서버 token provider가 필요합니다.",
      fix: "승인된 로컬 OAuth token helper로 repo 밖 token file을 생성한 뒤 validate-token-file을 실행하세요. token 값은 UI에 표시하지 않습니다.",
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
      current: readiness.scopes_ready ? "youtube.upload scope가 확인되었습니다." : "youtube.upload scope가 확인되지 않았습니다.",
      why: "token에 youtube.upload scope가 없으면 videos.insert 호출이 거부됩니다.",
      fix: "로컬 OAuth 생성 시 youtube.upload scope와 offline access가 포함되었는지 확인하세요.",
      source: "Server env and token metadata: YOUTUBE_SCOPES_READY, token scope metadata",
      details: [`scopes_ready=${String(readiness.scopes_ready)}`]
    }),
    manualGate({
      key: "candidate_ready",
      label_ko: "후보/업로드 입력 준비",
      current: "대시보드 폼에서 후보 ID와 제목/설명/제휴 링크를 확인해야 합니다.",
      why: "readiness resolver는 서버 환경만 판단합니다. 실제 candidate 입력은 화면에서 수동 확인해야 합니다.",
      fix: "후보 ID, 제목, 설명, 제휴 링크를 입력하고 prepare를 먼저 실행하세요.",
      source: "Dashboard form state",
      details: ["dashboard_form_required=true"]
    }),
    manualGate({
      key: "video_file_ready",
      label_ko: "영상 파일 준비",
      current: "대시보드 폼에서 로컬 mp4 경로를 확인해야 합니다.",
      why: "video file 경로는 서버 env가 아니라 operator 입력입니다.",
      fix: "repo 밖 또는 승인된 로컬 smoke mp4 경로를 입력하고 파일 존재 여부를 확인하세요.",
      source: "Dashboard form state",
      details: ["local_video_path_required=true"]
    }),
    manualGate({
      key: "disclosure_ready",
      label_ko: "제휴 고지 준비",
      current: "대시보드 폼에서 UTF-8 제휴 고지 문구를 확인해야 합니다.",
      why: "제휴 고지 누락 또는 깨진 문구는 업로드 전 차단되어야 합니다.",
      fix: "쿠팡파트너스 및 수수료 문구가 포함된 정상 한국어 고지 문구를 입력하세요.",
      source: "Dashboard form disclosure guard",
      details: ["disclosure_guard_required=true"]
    }),
    manualGate({
      key: "prepare_ready",
      label_ko: "Prepare 사전 검증",
      current: "execute 전에 /api/uploads/youtube/prepare가 통과해야 합니다.",
      why: "prepare는 업로드 요청 payload를 검증하지만 실제 YouTube 업로드는 실행하지 않습니다.",
      fix: "업로드 준비 확인 버튼을 눌러 prepare 결과가 통과인지 확인하세요.",
      source: "Dashboard prepare state",
      details: ["prepare_required_before_execute=true"]
    }),
    gate({
      key: "execute_ready",
      label_ko: "Execute 차단 게이트",
      passed: readiness.can_upload,
      current: readiness.can_upload ? "서버 readiness는 execute를 허용할 수 있는 상태입니다." : "서버 readiness가 execute를 차단합니다.",
      why: "execute는 모든 readiness와 승인 문구가 통과해야만 서버 API에서 추가 차단을 통과합니다.",
      fix: readiness.can_upload
        ? "prepare와 두 승인 문구를 확인한 뒤 private smoke 승인 범위에서만 실행하세요."
        : "위의 차단된 readiness 항목을 먼저 해결하세요.",
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
    why_blocked_ko: input.passed ? "현재 차단 사유가 없습니다." : input.why,
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
