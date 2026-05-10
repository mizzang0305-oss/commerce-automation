import { describe, expect, test } from "vitest";
import {
  canMarkReadyForManualUpload,
  canUploadToYouTube,
  getUploadGuardMessage
} from "@/lib/guards";
import { createDefaultSettings } from "@/lib/repositories/mockAutomationRepository";
import { createGeneratedContentFixture, createQueueItemFixture } from "@/test/fixtures";

describe("automation safety guards", () => {
  test("blocks YouTube public upload when automatic uploads are disabled", () => {
    const settings = createDefaultSettings();
    const item = createQueueItemFixture({ video_url: "https://cdn.example/video.mp4" });

    expect(canUploadToYouTube(settings, item, 0).ok).toBe(false);
    expect(getUploadGuardMessage(settings, item, 0)).toContain(
      "현재 자동 업로드는 비활성화되어 있습니다."
    );
  });

  test("requires affiliate link and disclosure text before manual upload readiness", () => {
    const itemWithoutAffiliate = createQueueItemFixture({ selected_affiliate_url: "" });
    const content = createGeneratedContentFixture({ disclosure_text: "제휴 고지" });

    expect(canMarkReadyForManualUpload(itemWithoutAffiliate, content).ok).toBe(false);
    expect(canMarkReadyForManualUpload(createQueueItemFixture(), { ...content, disclosure_text: "" }).ok).toBe(
      false
    );
  });

  test("requires video URL before upload readiness", () => {
    const settings = createDefaultSettings({ youtube_upload_enabled: true });
    const item = createQueueItemFixture({ video_url: "" });

    expect(canUploadToYouTube(settings, item, 0).ok).toBe(false);
  });

  test("returns a guard message when max daily public uploads are exceeded", () => {
    const settings = createDefaultSettings({ youtube_upload_enabled: true, max_daily_uploads: 6 });
    const item = createQueueItemFixture({ video_url: "https://cdn.example/video.mp4" });

    expect(canUploadToYouTube(settings, item, 6).ok).toBe(false);
    expect(getUploadGuardMessage(settings, item, 6)).toContain("하루 공개 업로드 제한");
  });
});
