import { beforeEach, describe, expect, test, vi } from "vitest";
import {
  ServerYouTubeUploadAdapter,
  buildYouTubeUploadRequest,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";

const secretNeedles = /refresh-secret-value|access-secret-value|client-secret|Authorization: Bearer/i;

const preparedVideoAsset = {
  asset_id: "asset-youtube-private-live-001",
  provider: "signed_url",
  signed_url: "https://assets.example.test/youtube-private-live-001.mp4",
  prepared_video_asset_url: "https://assets.example.test/youtube-private-live-001.mp4",
  mime_type: "video/mp4",
  size_bytes: 1024,
  server_accessible: true
};
const disclosureText = "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

function makeValidUploadRequest() {
  const result = buildYouTubeUploadRequest({
    candidate_id: "candidate-youtube-private-live-001",
    video_path_or_url: "C:\\local-dev-diagnostic\\youtube-private-live-001.mp4",
    prepared_video_asset: preparedVideoAsset,
    title: "Private upload smoke",
    description: `Private smoke test.\n\n${disclosureText}`,
    disclosure_text: disclosureText,
    selected_affiliate_url: "https://link.coupang.com/a/private-live-smoke",
    visibility: "private",
    tags: ["commerce", "private smoke"]
  });
  if (!result.ok) {
    throw new Error(`expected valid upload request: ${result.missing_reasons.join(",")}`);
  }
  return result.request;
}

describe("private YouTube live adapter readiness", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  test("blocks execute when live smoke approval is missing", async () => {
    const request = makeValidUploadRequest();
    const fetchMock = vi.fn();

    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "access-secret-value",
      fetchImpl: fetchMock
    }).upload(request);

    expect(result).toMatchObject({
      attempted: false,
      succeeded: false,
      side_effects: youtubeUploadSafeSideEffects,
      blocked_reasons: expect.arrayContaining(["live_smoke_approval_missing"])
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.youtube_video_id).toBeUndefined();
  });

  test("blocks execute when server token provider contract is not implemented", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest();
    const fetchMock = vi.fn();

    const result = await new ServerYouTubeUploadAdapter({ fetchImpl: fetchMock }).upload(request);

    expect(result).toMatchObject({
      attempted: false,
      succeeded: false,
      side_effects: youtubeUploadSafeSideEffects,
      blocked_reasons: expect.arrayContaining(["server_token_provider_contract_only"]),
      resumable_session_attempted: false
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });

  test("blocks execute when prepared video asset fetch fails", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("missing", { status: 404 }));

    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "access-secret-value",
      fetchImpl: fetchMock
    }).upload(request);

    expect(result).toMatchObject({
      attempted: false,
      succeeded: false,
      side_effects: youtubeUploadSafeSideEffects,
      blocked_reasons: expect.arrayContaining(["server_asset_fetch_failed"]),
      resumable_session_attempted: false
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });

  test("blocks execute when prepared video asset is not mp4", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest();
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response("not a video", { status: 200, headers: { "Content-Type": "text/plain" } })
    );

    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "access-secret-value",
      fetchImpl: fetchMock
    }).upload(request);

    expect(result).toMatchObject({
      attempted: false,
      succeeded: false,
      side_effects: youtubeUploadSafeSideEffects,
      blocked_reasons: expect.arrayContaining(["server_asset_not_mp4"])
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test("performs mocked resumable upload from server-accessible asset and requires a returned YouTube video id", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "video/mp4" }
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { Location: "https://upload.youtube.test/resumable-session" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "youtube-video-123",
        status: { privacyStatus: "private" }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "access-secret-value",
      fetchImpl: fetchMock
    }).upload(request);

    expect(result).toMatchObject({
      provider: "youtube",
      attempted: true,
      succeeded: true,
      youtube_video_id: "youtube-video-123",
      youtube_url: "https://www.youtube.com/watch?v=youtube-video-123",
      visibility: "private",
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
      }
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });

  test("uses server-only token provider callback for mocked private upload without exposing token", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest();
    const tokenProvider = vi.fn().mockResolvedValue({
      ok: true,
      accessToken: "access-secret-value",
      token_refresh_attempted: true,
      token_refresh_succeeded: true,
      token_file_updated: false
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "video/mp4" }
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { Location: "https://upload.youtube.test/resumable-session" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "youtube-video-from-provider",
        status: { privacyStatus: "private" }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await new ServerYouTubeUploadAdapter({
      accessTokenProvider: tokenProvider,
      fetchImpl: fetchMock
    }).upload(request);

    expect(result).toMatchObject({
      attempted: true,
      succeeded: true,
      youtube_video_id: "youtube-video-from-provider",
      token_refresh_attempted: true,
      token_refresh_succeeded: true,
      token_file_updated: false,
      side_effects: {
        external_api_called: true,
        youtube_upload_executed: true,
        uploaded: true,
        public_upload_enabled: false
      }
    });
    expect(tokenProvider).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });

  test("does not report success when YouTube returns no video id", async () => {
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
    const request = makeValidUploadRequest();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "video/mp4" }
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { Location: "https://upload.youtube.test/resumable-session" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ kind: "youtube#video" }), { status: 200 }));

    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "access-secret-value",
      fetchImpl: fetchMock
    }).upload(request);

    expect(result).toMatchObject({
      attempted: true,
      succeeded: false,
      side_effects: youtubeUploadSafeSideEffects,
      blocked_reasons: expect.arrayContaining(["youtube_video_id_missing"])
    });
    expect(result.youtube_video_id).toBeUndefined();
    expect(JSON.stringify(result)).not.toMatch(secretNeedles);
  });
});
