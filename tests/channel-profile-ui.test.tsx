import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ChannelAdminClient } from "@/components/ChannelAdminClient";
import type { ChannelProfile } from "@/types/automation";

const profile: ChannelProfile = {
  id: "channel-coupang-daily",
  channel_key: "coupang-daily",
  channel_name: "쿠팡 데일리 추천",
  platform: "youtube",
  youtube_channel_id: "UC_TEST_CHANNEL",
  youtube_handle: "@commerce-test",
  niche: "생활/가성비/쿠팡 인기템",
  allowed_categories: ["생활", "주방"],
  excluded_categories: ["의약품"],
  default_hashtags: ["#쿠팡추천", "#생활템"],
  title_template: "{product_name} 핵심 체크",
  description_template: "{description}\n\n{affiliate_url}",
  hashtag_template: "#쿠팡추천 #쇼츠",
  pinned_comment_template: "구매 전 가격과 옵션을 확인하세요.",
  upload_window: { start_hour: 9, end_hour: 21 },
  status: "active",
  upload_enabled: false,
  manual_upload_only: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z"
};

describe("channel admin UI", () => {
  test("renders channel readiness without exposing upload automation", () => {
    render(
      <ChannelAdminClient
        profiles={[profile]}
        packageCounts={{
          "channel-coupang-daily": {
            manual_ready: 2,
            uploaded: 1,
            needs_fix: 0
          }
        }}
        youtubeReadiness={{
          oauth_configured: false,
          upload_enabled: false,
          manual_upload_only: true
        }}
      />
    );

    expect(screen.getByRole("heading", { name: "채널 관리" })).toBeInTheDocument();
    expect(screen.getByText("쿠팡 데일리 추천")).toBeInTheDocument();
    expect(screen.getByText("upload_enabled=false")).toBeInTheDocument();
    expect(screen.getByText("manual_upload_only=true")).toBeInTheDocument();
    expect(screen.getByText("OAuth 준비 안 됨")).toBeInTheDocument();
    expect(screen.getByLabelText("채널명")).toHaveValue("쿠팡 데일리 추천");
    expect(screen.getByLabelText("YouTube 채널 ID")).toHaveValue("UC_TEST_CHANNEL");
    expect(screen.getByLabelText("제목 템플릿")).toHaveValue("{product_name} 핵심 체크");
    expect(screen.getAllByText("수동 업로드 준비").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.queryByText("YouTube 자동 업로드")).not.toBeInTheDocument();
  });
});
