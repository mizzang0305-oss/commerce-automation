import type { PlatformUploadSettings } from "@/lib/uploads/platformUploadTypes";
import {
  buildYouTubeReadinessGateResolver,
  type YouTubeReadinessGateResolutionStatus
} from "@/lib/uploads/youtube/readinessGateResolver";
import type { YouTubeLocalTokenProviderStatus, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";

export type UploadReadinessGateStatus = YouTubeReadinessGateResolutionStatus;

export type UploadReadinessGateView = {
  key: string;
  label_ko: string;
  status: UploadReadinessGateStatus;
  operator_summary_ko: string;
  current_state_ko: string;
  why_blocked_ko: string;
  fix_hint_ko: string;
  config_source_ko: string;
  safe_details: string[];
  secret_safe: true;
};

export type UploadReadinessSummaryView = {
  current_step_ko: string;
  can_upload: boolean;
  last_blocker_ko: string;
  next_action_ko: string;
  status_tone: "ready" | "blocked";
};

const BLOCKING_STATUSES = new Set<UploadReadinessGateStatus>(["blocked", "not_configured", "manual_required"]);

export function buildYouTubeReadinessSummaryView(
  gates: UploadReadinessGateView[],
  canUpload: boolean
): UploadReadinessSummaryView {
  const firstBlocked = gates.find((gate) => BLOCKING_STATUSES.has(gate.status));

  if (canUpload && !firstBlocked) {
    return {
      current_step_ko: "업로드 준비 완료",
      can_upload: true,
      last_blocker_ko: "현재 차단 항목이 없습니다.",
      next_action_ko: "대시보드에서 prepare를 먼저 확인하고 승인 문구를 정확히 입력해야 실행할 수 있습니다.",
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
  return buildYouTubeReadinessGateResolver(input).map((gate) => ({
    ...gate,
    operator_summary_ko: gate.current_state_ko
  }));
}
