import "server-only";

import type { YouTubeUploadAdapter, YouTubeUploadRequest, YouTubeUploadResult } from "@/lib/uploads/youtube/types";
import type { PreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import type { YouTubeUploadAccessTokenResult } from "@/lib/uploads/youtube/youtubeTokenProviderContract";
import { buildPreparedVideoAssetReadiness } from "@/lib/uploads/youtube/uploadAssetContract";
import { RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE, hasExactYouTubeLiveSmokeApproval } from "@/lib/uploads/youtube/youtubeUploadGuards";
import { blockedYouTubeUploadResult, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube/youtubeUploadErrors";

const YOUTUBE_VIDEO_INSERT_URL = "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable";

type ServerYouTubeUploadAdapterOptions = {
  accessToken?: string;
  accessTokenProvider?: () => Promise<YouTubeUploadAccessTokenResult>;
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
  private readonly accessTokenProvider?: () => Promise<YouTubeUploadAccessTokenResult>;
  private readonly fetchImpl: typeof fetch;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: ServerYouTubeUploadAdapterOptions = {}) {
    this.accessToken = options.accessToken;
    this.accessTokenProvider = options.accessTokenProvider;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.env = options.env ?? process.env;
  }

  async upload(request: YouTubeUploadRequest): Promise<YouTubeUploadResult> {
    if (
      !hasExactYouTubeLiveSmokeApproval(request.smoke_approval) &&
      !hasExactYouTubeLiveSmokeApproval(this.env.RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE)
    ) {
      return blockedYouTubeUploadResult(
        request.visibility,
        `Live YouTube upload smoke is blocked until ${RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE} is explicitly configured.`,
        ["live_smoke_approval_missing"],
        false
      );
    }

    const assetReadiness = buildPreparedVideoAssetReadiness({
      prepared_video_asset: request.prepared_video_asset,
      video_path_or_url: request.video_path_or_url
    });
    if (!assetReadiness.asset_ready || !assetReadiness.asset_ref) {
      return blockedYouTubeUploadResult(
        request.visibility,
        "YouTube upload requires a server-accessible prepared video asset reference.",
        assetReadiness.blocked_reasons.length ? assetReadiness.blocked_reasons : ["server_accessible_asset_required"],
        false
      );
    }

    const token = await this.resolveUploadAccessToken();
    if (!token.ok) {
      return blockedYouTubeUploadResult(
        request.visibility,
        token.safe_error,
        token.blocked_reasons,
        token.external_api_called,
        {
          token_refresh_attempted: token.token_refresh_attempted ?? false,
          token_refresh_succeeded: token.token_refresh_succeeded ?? false,
          resumable_session_attempted: false,
          reauth_required: token.reauth_required ?? false
        }
      );
    }

    const videoAsset = await this.readPreparedVideoAsset(assetReadiness.asset_ref);
    if (!videoAsset.ok) {
      return blockedYouTubeUploadResult(request.visibility, videoAsset.safe_error, videoAsset.blocked_reasons, false, {
        token_refresh_attempted: false,
        token_refresh_succeeded: false,
        resumable_session_attempted: false,
        reauth_required: false
      });
    }

    const session = await this.startResumableSession(request, token.accessToken, videoAsset.size);
    if (!session.ok) {
      return blockedYouTubeUploadResult(request.visibility, session.safe_error, session.blocked_reasons, true, {
        token_refresh_attempted: token.token_refresh_attempted ?? false,
        token_refresh_succeeded: token.token_refresh_succeeded ?? false,
        resumable_session_attempted: true
      });
    }

    const upload = await this.uploadVideoBytes(session.uploadUrl, token.accessToken, videoAsset);
    if (!upload.ok) {
      return blockedYouTubeUploadResult(request.visibility, upload.safe_error, upload.blocked_reasons, true, {
        token_refresh_attempted: token.token_refresh_attempted ?? false,
        token_refresh_succeeded: token.token_refresh_succeeded ?? false,
        resumable_session_attempted: true
      });
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
      approval_required: true,
      token_refresh_attempted: token.token_refresh_attempted ?? false,
      token_refresh_succeeded: token.token_refresh_succeeded ?? false,
      token_file_updated: token.token_file_updated ?? false,
      resumable_session_attempted: true
    };
  }

  private async resolveUploadAccessToken(): Promise<YouTubeUploadAccessTokenResult> {
    if (this.accessToken) {
      return {
        ok: true,
        accessToken: this.accessToken,
        token_refresh_attempted: false,
        token_refresh_succeeded: false,
        token_file_updated: false
      };
    }

    if (!this.accessTokenProvider) {
      return {
        ok: false,
        safe_error: "Server-side YouTube token provider contract is not implemented for live upload execution in this PR.",
        blocked_reasons: ["server_token_provider_contract_only"],
        external_api_called: false,
        token_refresh_attempted: false,
        token_refresh_succeeded: false,
        reauth_required: false
      };
    }

    const token = await this.accessTokenProvider();
    if (!token.ok || !token.accessToken.trim()) {
      return token.ok
        ? {
          ok: false,
          safe_error: "Server-side YouTube token provider did not return an upload token.",
          blocked_reasons: ["token_not_ready"],
          external_api_called: false,
          token_refresh_attempted: token.token_refresh_attempted ?? false,
          token_refresh_succeeded: token.token_refresh_succeeded ?? false,
          reauth_required: false
        }
        : token;
    }

    return token;
  }

  private async readPreparedVideoAsset(asset: PreparedVideoAssetRef):
    Promise<{ ok: true; bytes: ArrayBuffer; size: number } | { ok: false; blocked_reasons: string[]; safe_error: string }> {
    const assetUrl = asset.prepared_video_asset_url || asset.signed_url;
    if (!assetUrl || !/^https:\/\//i.test(assetUrl)) {
      return {
        ok: false,
        blocked_reasons: ["server_asset_signed_url_required"],
        safe_error: "Prepared video asset requires an HTTPS URL for server upload execution."
      };
    }

    const response = await this.fetchImpl(assetUrl, { method: "GET" });
    if (!response.ok) {
      return {
        ok: false,
        blocked_reasons: ["server_asset_fetch_failed"],
        safe_error: `Prepared video asset fetch failed with HTTP ${response.status}.`
      };
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (contentType && !contentType.includes("video/mp4")) {
      return {
        ok: false,
        blocked_reasons: ["server_asset_not_mp4"],
        safe_error: "Prepared video asset did not return video/mp4 content."
      };
    }

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength <= 0) {
      return {
        ok: false,
        blocked_reasons: ["server_asset_empty"],
        safe_error: "Prepared video asset was empty."
      };
    }

    return {
      ok: true,
      bytes,
      size: bytes.byteLength
    };
  }

  private async startResumableSession(request: YouTubeUploadRequest, accessToken: string, fileSize: number) {
    const response = await this.fetchImpl(YOUTUBE_VIDEO_INSERT_URL, {
      method: "POST",
      headers: new Headers({
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(fileSize)
      }),
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
    });

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

  private async uploadVideoBytes(uploadUrl: string, accessToken: string, video: UploadableVideoFile) {
    const response = await this.fetchImpl(uploadUrl, {
      method: "PUT",
      headers: new Headers({
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
        "Content-Length": String(video.size)
      }),
      body: new Uint8Array(video.bytes)
    });
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

type UploadableVideoFile = {
  bytes: ArrayBuffer;
  size: number;
};

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
