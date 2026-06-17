import type { YouTubeUploadRequestInput } from "@/lib/uploads/youtube/types";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE
} from "@/lib/uploads/youtube/youtubeUploadGuards";

export const YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID = "candidate-video-smoke-001";

export const YOUTUBE_PRIVATE_SMOKE_VIDEO_PATH =
  "commerce-assets/output/video-packages/youtube-private-smoke-001/youtube-private-smoke-001.mp4";

export const YOUTUBE_PRIVATE_SMOKE_DISCLOSURE_TEXT =
  "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

type YouTubePrivateSmokePayloadOverride = Partial<
  Pick<YouTubeUploadRequestInput, "video_path_or_url" | "visibility" | "title" | "description" | "tags">
>;

export type YouTubePrivateSmokePayload = YouTubeUploadRequestInput & {
  confirmation: typeof APPROVE_YOUTUBE_PRIVATE_UPLOAD;
  made_for_kids: false;
};

export function buildYouTubePrivateSmokePayload(
  override: YouTubePrivateSmokePayloadOverride = {}
): YouTubePrivateSmokePayload {
  return {
    candidate_id: YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID,
    confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
    smoke_approval: RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE,
    execution_intent: "live_smoke",
    video_path_or_url: override.video_path_or_url ?? YOUTUBE_PRIVATE_SMOKE_VIDEO_PATH,
    title: override.title ?? "Commerce Automation Private Upload Smoke",
    description: override.description ?? [
      "Commerce Automation private upload smoke test.",
      YOUTUBE_PRIVATE_SMOKE_DISCLOSURE_TEXT
    ].join("\n\n"),
    disclosure_text: YOUTUBE_PRIVATE_SMOKE_DISCLOSURE_TEXT,
    selected_affiliate_url: "https://link.coupang.com/a/test-smoke",
    tags: override.tags ?? ["commerce automation", "private smoke"],
    visibility: override.visibility ?? "private",
    made_for_kids: false
  };
}
