import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { GET as getYouTubeReadiness } from "../app/api/uploads/youtube/readiness/route";
import { POST as postYouTubePrepare } from "../app/api/uploads/youtube/prepare/route";
import { POST as postYouTubeExecute } from "../app/api/uploads/youtube/execute/route";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  MockYouTubeUploadAdapter,
  buildYouTubeUploadRequest,
  buildYouTubeUploadReadiness,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";

const validRequestBody = {
  candidate_id: "candidate-youtube-upload-001",
  video_path_or_url: "commerce-assets/output/video-packages/candidate-youtube-upload-001/shorts.mp4",
  title: "Desk organizer set quick review",
  description: "A private upload draft for operator review.",
  disclosure_text:
    "이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  selected_affiliate_url: "https://link.coupang.com/a/candidate-youtube-upload-001",
  tags: ["desk", "organizer"],
  visibility: "private"
};

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("YouTube upload adapter readiness and gates", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("readiness is false without token provider and never exposes secret values", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "client-id-secret-value");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "client-secret-value");
    vi.stubEnv("YOUTUBE_REDIRECT_URI", "https://example.test/oauth/callback");

    const readiness = buildYouTubeUploadReadiness();

    expect(readiness).toMatchObject({
      provider: "youtube",
      configured: false,
      token_ready: false,
      scopes_ready: false,
      quota_ready: false,
      account_ready: false,
      policy_ready: false,
      upload_enabled: false,
      can_upload: false
    });
    expect(readiness.blocked_reasons).toEqual(expect.arrayContaining(["token_not_ready", "upload_disabled"]));
    expect(JSON.stringify(readiness)).not.toContain("client-secret-value");

    const response = await getYouTubeReadiness();
    const payload = await json(response);
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      readiness: {
        provider: "youtube",
        token_ready: false,
        can_upload: false
      },
      secrets_exposed: false,
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(JSON.stringify(payload)).not.toMatch(/client-secret-value|refresh_token|access_token|Authorization: Bearer/i);
  });

  test("prepare rejects missing video, disclosure, affiliate URL, and public visibility", async () => {
    const missingVideo = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        video_path_or_url: ""
      })
    }));
    expect(missingVideo.status).toBe(400);
    expect(await json(missingVideo)).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      missing_reasons: expect.arrayContaining(["video_path_or_url"])
    });

    const publicVisibility = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        visibility: "public"
      })
    }));
    expect(publicVisibility.status).toBe(400);
    expect(await json(publicVisibility)).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      missing_reasons: expect.arrayContaining(["visibility_not_allowed"])
    });

    const missingPolicyInputs = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        disclosure_text: "",
        selected_affiliate_url: ""
      })
    }));
    expect(missingPolicyInputs.status).toBe(400);
    expect(await json(missingPolicyInputs)).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["disclosure_text", "selected_affiliate_url"])
    });
  });

  test("builds a private or unlisted request with disclosure copied into the description", () => {
    const result = buildYouTubeUploadRequest({
      ...validRequestBody,
      visibility: "unlisted"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("expected request build success");
    }
    expect(result.request).toMatchObject({
      provider: "youtube",
      visibility: "unlisted",
      made_for_kids: false,
      self_declared_made_for_kids: false
    });
    expect(result.request.description).toContain(validRequestBody.disclosure_text);
    expect(result.request.description).toContain(validRequestBody.selected_affiliate_url);
    expect(result.request.visibility).not.toBe("public");
  });

  test("execute rejects wrong confirmation and token-not-ready readiness", async () => {
    const wrongConfirmation = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: "APPROVE_PUBLIC_UPLOAD"
      })
    }));
    expect(wrongConfirmation.status).toBe(403);
    expect(await json(wrongConfirmation)).toMatchObject({
      ok: false,
      error_code: "BLOCKED_BY_CONFIRMATION",
      result: {
        attempted: false,
        succeeded: false
      }
    });

    const blockedByReadiness = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD
      })
    }));
    expect(blockedByReadiness.status).toBe(403);
    expect(await json(blockedByReadiness)).toMatchObject({
      ok: false,
      error_code: "BLOCKED_BY_YOUTUBE_READINESS",
      readiness: {
        can_upload: false
      }
    });
  });

  test("mock adapter is explicit and does not report production upload success", async () => {
    const request = buildYouTubeUploadRequest(validRequestBody);
    if (!request.ok) {
      throw new Error("expected valid request");
    }

    const result = await new MockYouTubeUploadAdapter().upload(request.request);

    expect(result).toMatchObject({
      provider: "youtube",
      attempted: true,
      succeeded: false,
      youtube_video_id: undefined,
      safe_message: "Mock YouTube adapter accepted the request without calling YouTube.",
      approval_required: true,
      side_effects: {
        external_api_called: false,
        youtube_upload_executed: false,
        uploaded: false,
        db_written: false,
        r2_uploaded: false,
        queue_created: false,
        worker_job_created: false,
        platform_upload_triggered: false,
        public_upload_enabled: false
      }
    });
    expect(JSON.stringify(result)).not.toMatch(/refresh_token|access_token|Authorization: Bearer/i);
  });
});
