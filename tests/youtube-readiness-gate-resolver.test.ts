import { describe, expect, test } from "vitest";
import type { PlatformUploadSettings } from "@/lib/uploads/platformUploadTypes";
import { buildYouTubeReadinessGateResolver } from "@/lib/uploads/youtube/readinessGateResolver";
import type { YouTubeLocalTokenProviderStatus, YouTubeUploadReadiness } from "@/lib/uploads/youtube/types";

const settings: PlatformUploadSettings = {
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

const tokenReadiness: YouTubeLocalTokenProviderStatus = {
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

describe("YouTube readiness gate resolver", () => {
  test("returns required readiness gates with safe Korean guidance", () => {
    const gates = buildYouTubeReadinessGateResolver({
      readiness: blockedReadiness,
      tokenReadiness,
      settings
    });

    expect(gates.map((gate) => gate.key)).toEqual([
      "provider_ready",
      "quota_ready",
      "account_ready",
      "policy_ready",
      "youtube_upload_enabled",
      "public_upload_blocked",
      "manual_upload_only",
      "approval_required",
      "token_ready",
      "scopes_ready",
      "candidate_ready",
      "video_file_ready",
      "disclosure_ready",
      "prepare_ready",
      "execute_ready"
    ]);
    expect(gates.find((gate) => gate.key === "quota_ready")?.label_ko).toBe("YouTube 할당량 준비");
    expect(gates.find((gate) => gate.key === "account_ready")?.label_ko).toBe("YouTube 계정/채널 준비");
    expect(gates.find((gate) => gate.key === "policy_ready")?.label_ko).toBe("업로드 정책 준비");
    expect(gates.find((gate) => gate.key === "youtube_upload_enabled")?.label_ko).toBe("YouTube 업로드 기능 플래그");
    expect(gates.find((gate) => gate.key === "candidate_ready")?.status).toBe("manual_required");
    expect(gates.find((gate) => gate.key === "public_upload_blocked")?.status).toBe("pass");
  });

  test("does not expose token, client secret, or authorization values", () => {
    const gates = buildYouTubeReadinessGateResolver({
      readiness: blockedReadiness,
      tokenReadiness,
      settings
    });
    const serialized = JSON.stringify(gates);

    expect(serialized).not.toMatch(/test-access-token|test-refresh-token|configured-client-secret|Authorization: Bearer/i);
    expect(gates.every((gate) => gate.secret_safe)).toBe(true);
  });
});
