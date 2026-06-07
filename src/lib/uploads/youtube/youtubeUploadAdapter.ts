import "server-only";

import type { YouTubeUploadAdapter, YouTubeUploadRequest, YouTubeUploadResult } from "@/lib/uploads/youtube/types";
import { RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE, hasExactYouTubeLiveSmokeApproval } from "@/lib/uploads/youtube/youtubeUploadGuards";
import { blockedYouTubeUploadResult, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube/youtubeUploadErrors";

export class MockYouTubeUploadAdapter implements YouTubeUploadAdapter {
  async upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult> {
    return {
      provider: "youtube",
      attempted: true,
      succeeded: false,
      youtube_video_id: undefined,
      youtube_url: undefined,
      visibility: request.visibility,
      safe_message: "Mock YouTube adapter accepted the request without calling YouTube.",
      blocked_reasons: ["mock_adapter_no_external_api_call"],
      side_effects: youtubeUploadSafeSideEffects,
      approval_required: true
    };
  }
}

export class ServerYouTubeUploadAdapter implements YouTubeUploadAdapter {
  async upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult> {
    if (!hasExactYouTubeLiveSmokeApproval(process.env.RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE)) {
      return blockedYouTubeUploadResult(
        request.visibility,
        `Live YouTube upload smoke is blocked until ${RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE} is explicitly configured.`,
        ["live_smoke_approval_missing"],
        false
      );
    }

    return blockedYouTubeUploadResult(
      request.visibility,
      "YouTube live upload execution is intentionally blocked in this adapter scaffold.",
      ["server_adapter_scaffold_only"],
      false
    );
  }
}
