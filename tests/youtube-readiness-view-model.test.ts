import { describe, expect, test } from "vitest";
import type { PlatformUploadSettings } from "@/lib/uploads/platformUploadTypes";
import type { YouTubeLocalTokenProviderStatus, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";
import {
  buildYouTubeReadinessGateViews,
  buildYouTubeReadinessSummaryView
} from "@/lib/uploads/youtube/readinessViewModel";

const defaultSettings: PlatformUploadSettings = {
  youtube_upload_enabled: false,
  tiktok_upload_enabled: false,
  threads_upload_enabled: false,
  manual_upload_only: true,
  public_upload_enabled: false,
  approval_required: true,
  default_visibility: "private",
  max_daily_uploads: 1
};

const blockedReadiness: YouTubeUploadReadiness = {
  provider: "youtube",
  configured: false,
  token_ready: false,
  scopes_ready: false,
  quota_ready: false,
  account_ready: false,
  policy_ready: false,
  upload_enabled: false,
  can_upload: false,
  blocked_reasons: [
    "provider_not_configured",
    "token_not_ready",
    "scopes_not_ready",
    "quota_not_ready",
    "account_not_ready",
    "policy_not_ready",
    "upload_disabled"
  ]
};

const blockedTokenReadiness: YouTubeLocalTokenProviderStatus = {
  configured: false,
  token_file_path_configured: false,
  token_file_inside_repo: false,
  token_file_gitignored_or_outside_repo: true,
  token_file_exists: false,
  token_ready: false,
  scopes_ready: false,
  safe_summary: "Token file path is not configured.",
  blocked_reasons: ["token_file_path_missing", "token_not_ready", "scopes_not_ready"]
};

describe("YouTube readiness view model", () => {
  test("returns Korean gate labels and fix hints for blocked readiness", () => {
    const gates = buildYouTubeReadinessGateViews({
      readiness: blockedReadiness,
      tokenReadiness: blockedTokenReadiness,
      settings: defaultSettings
    });

    expect(gates.map((gate) => gate.label_ko)).toEqual([
      "YouTube 제공자 설정",
      "토큰 파일 경로",
      "업로드 토큰 준비",
      "YouTube 업로드 권한 범위",
      "쿼터 확인",
      "채널 계정 확인",
      "정책 확인",
      "YouTube 업로드 기능 플래그",
      "수동 검증 정책",
      "승인 문구 필요",
      "공개 업로드 차단"
    ]);
    expect(gates.find((gate) => gate.key === "token_file_configured")?.status).toBe("not_configured");
    expect(gates.find((gate) => gate.key === "youtube_upload_enabled")?.operator_summary_ko).toContain("차단");
    expect(gates.find((gate) => gate.key === "public_upload_blocked")?.status).toBe("pass");
  });

  test("builds blocked summary from the first failing gate", () => {
    const gates = buildYouTubeReadinessGateViews({
      readiness: blockedReadiness,
      tokenReadiness: blockedTokenReadiness,
      settings: defaultSettings
    });
    const summary = buildYouTubeReadinessSummaryView(gates, false);

    expect(summary.can_upload).toBe(false);
    expect(summary.current_step_ko).toBe("업로드 실행 차단");
    expect(summary.last_blocker_ko).toContain("YouTube OAuth 제공자 설정");
  });

  test("does not include token or authorization values in safe details", () => {
    const gates = buildYouTubeReadinessGateViews({
      readiness: blockedReadiness,
      tokenReadiness: blockedTokenReadiness,
      settings: defaultSettings
    });
    const serialized = JSON.stringify(gates);

    expect(serialized).not.toMatch(/access_token|refresh_token|client_secret|Authorization: Bearer/i);
  });
});
