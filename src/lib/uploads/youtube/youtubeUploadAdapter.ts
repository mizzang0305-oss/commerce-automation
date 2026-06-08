import "server-only";

import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { YouTubeUploadAdapter, YouTubeUploadRequest, YouTubeUploadResult } from "@/lib/uploads/youtube/types";
import { RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE, hasExactYouTubeLiveSmokeApproval } from "@/lib/uploads/youtube/youtubeUploadGuards";
import { blockedYouTubeUploadResult, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube/youtubeUploadErrors";
import { readYouTubeAccessTokenFromLocalFile } from "@/lib/uploads/youtube/youtubeTokenFile";

const YOUTUBE_VIDEO_INSERT_URL = "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable";

type ServerYouTubeUploadAdapterOptions = {
  accessToken?: string;
  fetchImpl?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

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
  private readonly accessToken?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: ServerYouTubeUploadAdapterOptions = {}) {
    this.accessToken = options.accessToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.env = options.env ?? process.env;
  }

  async upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult> {
    if (!hasExactYouTubeLiveSmokeApproval(this.env.RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE)) {
      return blockedYouTubeUploadResult(
        request.visibility,
        `Live YouTube upload smoke is blocked until ${RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE} is explicitly configured.`,
        ["live_smoke_approval_missing"],
        false
      );
    }

    const localVideo = readLocalMp4(request.video_path_or_url);
    if (!localVideo.ok) {
      return blockedYouTubeUploadResult(request.visibility, localVideo.safe_error, localVideo.blocked_reasons, false);
    }

    const token = this.accessToken
      ? { ok: true as const, accessToken: this.accessToken, refreshed: false }
      : await readYouTubeAccessTokenFromLocalFile({ env: this.env, fetchImpl: this.fetchImpl });
    if (!token.ok) {
      return blockedYouTubeUploadResult(request.visibility, token.safe_error, token.blocked_reasons, false);
    }

    const session = await this.startResumableSession(request, token.accessToken, localVideo.size);
    if (!session.ok) {
      return blockedYouTubeUploadResult(request.visibility, session.safe_error, session.blocked_reasons, true);
    }

    const upload = await this.uploadVideoBytes(session.uploadUrl, token.accessToken, localVideo);
    if (!upload.ok) {
      return blockedYouTubeUploadResult(request.visibility, upload.safe_error, upload.blocked_reasons, true);
    }

    return {
      provider: "youtube",
      attempted: true,
      succeeded: true,
      youtube_video_id: upload.youtube_video_id,
      youtube_url: `https://www.youtube.com/watch?v=${upload.youtube_video_id}`,
      visibility: request.visibility,
      safe_message: "YouTube private/unlisted upload completed.",
      blocked_reasons: [],
      side_effects: {
        external_api_called: true,
        youtube_upload_executed: true,
        uploaded: true,
        db_written: false,
        r2_uploaded: false,
        queue_created: false,
        worker_job_created: false,
        platform_upload_triggered: true,
        public_upload_enabled: false
      },
      approval_required: true
    };
  }

  private async startResumableSession(request: YouTubeUploadRequest, accessToken: string, fileSize: number) {
    const response = await this.fetchImpl(new Request(YOUTUBE_VIDEO_INSERT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(fileSize)
      },
      body: JSON.stringify({
        snippet: {
          title: request.title,
          description: request.description,
          tags: request.tags,
          categoryId: request.category_id
        },
        status: {
          privacyStatus: request.visibility,
          selfDeclaredMadeForKids: false
        }
      })
    }));

    if (!response.ok) {
      return {
        ok: false as const,
        blocked_reasons: ["youtube_resumable_session_failed"],
        safe_error: `YouTube resumable session failed with HTTP ${response.status}.`
      };
    }

    const uploadUrl = response.headers.get("Location")?.trim();
    if (!uploadUrl) {
      return {
        ok: false as const,
        blocked_reasons: ["youtube_resumable_location_missing"],
        safe_error: "YouTube resumable session did not return an upload location."
      };
    }

    return {
      ok: true as const,
      uploadUrl
    };
  }

  private async uploadVideoBytes(uploadUrl: string, accessToken: string, video: LocalVideoFile) {
    const response = await this.fetchImpl(new Request(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
        "Content-Length": String(video.size)
      },
      body: new Uint8Array(video.bytes)
    }));
    const payload = await safeJson(response);

    if (!response.ok) {
      return {
        ok: false as const,
        blocked_reasons: ["youtube_video_upload_failed"],
        safe_error: `YouTube video upload failed with HTTP ${response.status}.`
      };
    }

    if (typeof payload.id !== "string" || !payload.id.trim()) {
      return {
        ok: false as const,
        blocked_reasons: ["youtube_video_id_missing"],
        safe_error: "YouTube upload response did not include a video id."
      };
    }

    return {
      ok: true as const,
      youtube_video_id: payload.id.trim()
    };
  }
}

type LocalVideoFile = {
  bytes: Buffer;
  size: number;
};

function readLocalMp4(videoPathOrUrl: string):
  | { ok: true; bytes: Buffer; size: number }
  | { ok: false; blocked_reasons: string[]; safe_error: string } {
  if (/^https?:\/\//i.test(videoPathOrUrl)) {
    return {
      ok: false,
      blocked_reasons: ["local_video_file_required"],
      safe_error: "YouTube private smoke requires a local mp4 file path."
    };
  }

  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ videoPathOrUrl);
  if (path.extname(resolvedPath).toLowerCase() !== ".mp4") {
    return {
      ok: false,
      blocked_reasons: ["video_file_not_mp4"],
      safe_error: "YouTube private smoke requires an mp4 file."
    };
  }

  try {
    const stat = statSync(/*turbopackIgnore: true*/ resolvedPath);
    if (!stat.isFile() || stat.size <= 0) {
      return {
        ok: false,
        blocked_reasons: ["video_file_empty"],
        safe_error: "YouTube private smoke video file is empty or invalid."
      };
    }
    return {
      ok: true,
      bytes: readFileSync(/*turbopackIgnore: true*/ resolvedPath),
      size: stat.size
    };
  } catch {
    return {
      ok: false,
      blocked_reasons: ["video_file_missing"],
      safe_error: "YouTube private smoke video file does not exist."
    };
  }
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
