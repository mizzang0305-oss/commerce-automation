import type { PlatformUploadSettings } from "@/lib/uploads/platformUploadTypes";
import type { YouTubeLocalTokenProviderStatus, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";

export type UploadReadinessGateStatus = "pass" | "blocked" | "warning" | "not_configured";

export type UploadReadinessGateView = {
  key: string;
  label_ko: string;
  status: UploadReadinessGateStatus;
  operator_summary_ko: string;
  fix_hint_ko: string;
  safe_details?: string[];
};

export type UploadReadinessSummaryView = {
  current_step_ko: string;
  can_upload: boolean;
  last_blocker_ko: string;
  next_action_ko: string;
  status_tone: "ready" | "blocked";
};

export function buildYouTubeReadinessSummaryView(
  gates: UploadReadinessGateView[],
  canUpload: boolean
): UploadReadinessSummaryView {
  const firstBlocked = gates.find((gate) => gate.status === "blocked" || gate.status === "not_configured");

  if (canUpload && !firstBlocked) {
    return {
      current_step_ko: "업로드 준비 완료",
      can_upload: true,
      last_blocker_ko: "남은 차단 항목이 없습니다.",
      next_action_ko: "대시보드에서 prepare를 먼저 확인한 뒤, 두 승인 문구를 정확히 입력해야 실행할 수 있습니다.",
      status_tone: "ready"
    };
  }

  return {
    current_step_ko: "업로드 실행 차단",
    can_upload: false,
    last_blocker_ko: firstBlocked?.operator_summary_ko ?? "YouTube readiness가 아직 통과하지 않았습니다.",
    next_action_ko: firstBlocked?.fix_hint_ko ?? "아래 차단 항목을 해결한 뒤 readiness를 다시 확인하세요.",
    status_tone: "blocked"
  };
}

export function buildYouTubeReadinessGateViews(input: {
  readiness: YouTubeUploadReadiness;
  tokenReadiness: YouTubeLocalTokenProviderStatus;
  settings: PlatformUploadSettings;
}): UploadReadinessGateView[] {
  const { readiness, tokenReadiness, settings } = input;

  return [
    gate({
      key: "provider_ready",
      label_ko: "YouTube 제공자 설정",
      passed: readiness.configured,
      blockedStatus: "not_configured",
      pass: "YouTube OAuth 제공자 설정이 서버 환경에서 확인되었습니다.",
      blocked: "YouTube OAuth 제공자 설정이 부족합니다.",
      fix: "서버 환경변수의 YouTube OAuth client 설정을 확인한 뒤 dev server를 재시작하세요."
    }),
    gate({
      key: "token_file_configured",
      label_ko: "토큰 파일 경로",
      passed: tokenReadiness.token_file_path_configured && !tokenReadiness.token_file_inside_repo,
      blockedStatus: tokenReadiness.token_file_path_configured ? "blocked" : "not_configured",
      pass: "토큰 파일 경로가 repo 밖 경로로 설정되어 있습니다.",
      blocked: tokenReadiness.token_file_inside_repo
        ? "토큰 파일 경로가 repo 내부를 가리켜 차단되었습니다."
        : "서버가 토큰 파일 경로를 보지 못했습니다.",
      fix: "YOUTUBE_TOKEN_FILE 또는 YOUTUBE_LOCAL_TOKEN_FILE_PATH를 repo 밖 경로로 설정하고 dev server를 재시작하세요."
    }),
    gate({
      key: "token_ready",
      label_ko: "업로드 토큰 준비",
      passed: readiness.token_ready,
      pass: "업로드에 필요한 토큰 메타데이터가 준비되었습니다.",
      blocked: "업로드 토큰 메타데이터가 아직 준비되지 않았습니다.",
      fix: "로컬 OAuth 토큰 파일 존재 여부와 token readiness를 확인하세요. 토큰 값은 UI나 로그에 출력하지 않습니다."
    }),
    gate({
      key: "scopes_ready",
      label_ko: "YouTube 업로드 권한 범위",
      passed: readiness.scopes_ready,
      pass: "youtube.upload scope가 확인되었습니다.",
      blocked: "youtube.upload scope가 확인되지 않았습니다.",
      fix: "로컬 OAuth 토큰 생성 시 youtube.upload scope와 offline access가 포함되었는지 확인하세요."
    }),
    gate({
      key: "quota_ready",
      label_ko: "쿼터 확인",
      passed: readiness.quota_ready,
      pass: "업로드 쿼터 확인 플래그가 통과했습니다.",
      blocked: "YouTube 업로드 쿼터 준비 플래그가 통과하지 않았습니다.",
      fix: "Google Cloud Console에서 YouTube Data API 쿼터와 프로젝트 제한을 확인한 뒤 readiness 플래그를 명시적으로 설정하세요."
    }),
    gate({
      key: "account_ready",
      label_ko: "채널 계정 확인",
      passed: readiness.account_ready,
      pass: "업로드 대상 채널 계정 확인이 완료되었습니다.",
      blocked: "업로드 대상 YouTube 채널 계정 확인이 완료되지 않았습니다.",
      fix: "브랜드 채널 계정, 업로드 권한, Studio 접근 가능 여부를 수동 확인하세요."
    }),
    gate({
      key: "policy_ready",
      label_ko: "정책 확인",
      passed: readiness.policy_ready,
      pass: "비공개 또는 일부 공개 smoke 정책 확인이 완료되었습니다.",
      blocked: "정책 확인이 완료되지 않았거나 public upload 차단 조건이 통과하지 않았습니다.",
      fix: "비공개 업로드 정책, 제휴 고지 문구, public upload 차단 상태를 확인하세요."
    }),
    gate({
      key: "youtube_upload_enabled",
      label_ko: "YouTube 업로드 기능 플래그",
      passed: readiness.upload_enabled,
      pass: "승인된 smoke를 위한 YouTube 업로드 기능 플래그가 켜져 있습니다.",
      blocked: "YouTube 업로드 기능 플래그가 꺼져 있어 실제 업로드 실행이 차단됩니다.",
      fix: "운영 기본값은 false입니다. 승인된 smoke 환경에서만 명시적으로 켜고 다시 확인하세요."
    }),
    {
      key: "manual_upload_only",
      label_ko: "수동 검증 정책",
      status: settings.manual_upload_only ? "pass" : "blocked",
      operator_summary_ko: settings.manual_upload_only
        ? "수동 검증 정책이 켜져 있어 자동 공개 전환을 막습니다."
        : "manual_upload_only=false는 현재 smoke 정책에 맞지 않습니다.",
      fix_hint_ko: settings.manual_upload_only
        ? "YouTube Studio에서 비공개 상태와 고지 문구를 직접 확인하세요."
        : "manual_upload_only=true를 유지하세요.",
      safe_details: [`manual_upload_only=${String(settings.manual_upload_only)}`]
    },
    {
      key: "approval_required",
      label_ko: "승인 문구 필요",
      status: settings.approval_required ? "pass" : "blocked",
      operator_summary_ko: settings.approval_required
        ? "실행 전 두 개의 정확한 승인 문구가 필요합니다."
        : "approval_required=false는 허용되지 않습니다.",
      fix_hint_ko: "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE와 APPROVE_YOUTUBE_PRIVATE_UPLOAD를 화면에 정확히 입력해야 합니다.",
      safe_details: [`approval_required=${String(settings.approval_required)}`]
    },
    {
      key: "public_upload_blocked",
      label_ko: "공개 업로드 차단",
      status: settings.public_upload_enabled ? "blocked" : "pass",
      operator_summary_ko: settings.public_upload_enabled
        ? "public upload가 열려 있어 즉시 중단해야 합니다."
        : "public 업로드가 차단되어 있습니다.",
      fix_hint_ko: settings.public_upload_enabled
        ? "PUBLIC_UPLOAD_ENABLED를 false로 되돌리고 화면을 다시 확인하세요."
        : "visibility는 private 또는 unlisted만 사용할 수 있습니다.",
      safe_details: [`public_upload_enabled=${String(settings.public_upload_enabled)}`]
    }
  ];
}

function gate(input: {
  key: string;
  label_ko: string;
  passed: boolean;
  pass: string;
  blocked: string;
  fix: string;
  blockedStatus?: UploadReadinessGateStatus;
}): UploadReadinessGateView {
  return {
    key: input.key,
    label_ko: input.label_ko,
    status: input.passed ? "pass" : input.blockedStatus ?? "blocked",
    operator_summary_ko: input.passed ? input.pass : input.blocked,
    fix_hint_ko: input.fix,
    safe_details: [`${input.key}=${String(input.passed)}`]
  };
}
