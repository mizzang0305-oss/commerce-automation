import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import { GET as getYouTubeReadiness } from "../app/api/uploads/youtube/readiness/route";
import { POST as postYouTubePrepare } from "../app/api/uploads/youtube/prepare/route";
import { POST as postYouTubeExecute } from "../app/api/uploads/youtube/execute/route";
import { POST as postYouTubeExecuteReadiness } from "../app/api/uploads/youtube/execute-readiness/route";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  MockYouTubeUploadAdapter,
  buildYouTubeUploadRequest,
  buildYouTubePrivateSmokePayload,
  buildYouTubeUploadReadiness,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";

const validRequestBody = {
  candidate_id: "candidate-youtube-upload-001",
  product_name: "Desk organizer set",
  product_source: "coupang",
  video_path_or_url: "commerce-assets/output/video-packages/candidate-youtube-upload-001/shorts.mp4",
  prepared_video_asset: {
    asset_id: "asset-candidate-youtube-upload-001",
    provider: "signed_url",
    signed_url: "https://assets.example.test/candidate-youtube-upload-001.mp4",
    prepared_video_asset_url: "https://assets.example.test/candidate-youtube-upload-001.mp4",
    mime_type: "video/mp4",
    size_bytes: 1024,
    server_accessible: true
  },
  title: "Desk organizer set quick review",
  description: "A private upload draft for operator review.",
  disclosure_text:
    "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.",
  selected_affiliate_url: "https://link.coupang.com/a/candidate-youtube-upload-001",
  tags: ["desk", "organizer"],
  visibility: "private"
};

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function clearYouTubeEnv() {
  for (const name of [
    "YOUTUBE_LOCAL_TOKEN_FILE_PATH",
    "YOUTUBE_TOKEN_FILE",
    "YOUTUBE_TOKEN_PROVIDER_MODE",
    "YOUTUBE_TOKEN_PROVIDER",
    "YOUTUBE_TOKEN_READY",
    "YOUTUBE_SCOPES_READY",
    "YOUTUBE_UPLOAD_ENABLED",
    "YOUTUBE_PRIVATE_UPLOAD_ENABLED",
    "YOUTUBE_QUOTA_READY",
    "YOUTUBE_ACCOUNT_READY",
    "YOUTUBE_POLICY_READY",
    "PUBLIC_UPLOAD_ENABLED",
    "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE"
  ]) {
    vi.stubEnv(name, "");
  }
}

describe("YouTube upload adapter readiness and gates", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    clearYouTubeEnv();
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
        video_path_or_url: "",
        prepared_video_asset: null
      })
    }));
    expect(missingVideo.status).toBe(400);
    expect(await json(missingVideo)).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      missing_reasons: expect.arrayContaining(["prepared_video_asset_ref"])
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

  test("prepare rejects garbled or incomplete Korean disclosure text before upload execution", async () => {
    const garbledDisclosure = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        description: "Commerce Automation private upload smoke test.\n\n? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????.",
        disclosure_text: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????."
      })
    }));
    expect(garbledDisclosure.status).toBe(400);
    expect(await json(garbledDisclosure)).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      missing_reasons: expect.arrayContaining(["disclosure_text_garbled"]),
      side_effects: youtubeUploadSafeSideEffects
    });

    const missingKoreanKeyword = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        disclosure_text: "이 콘텐츠는 제휴 활동을 포함합니다."
      })
    }));
    expect(missingKoreanKeyword.status).toBe(400);
    expect(await json(missingKoreanKeyword)).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["disclosure_text_missing_required_korean"])
    });
  });

  test("prepare keeps candidate_id required and blocks local-path-only smoke candidate payload for domain readiness", async () => {
    const missingCandidate = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        candidate_id: ""
      })
    }));
    expect(missingCandidate.status).toBe(400);
    expect(await json(missingCandidate)).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      missing_reasons: expect.arrayContaining(["candidate_id"])
    });

    const smokePayload = buildYouTubePrivateSmokePayload({
      video_path_or_url: "commerce-assets/output/video-packages/youtube-private-smoke-001/youtube-private-smoke-001.mp4"
    });
    const readySmoke = await postYouTubePrepare(new Request("http://localhost/api/uploads/youtube/prepare", {
      method: "POST",
      body: JSON.stringify(smokePayload)
    }));
    const payload = await json(readySmoke);

    expect(readySmoke.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      missing_reasons: expect.arrayContaining(["server_accessible_asset_required"]),
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|Authorization: Bearer/i);
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

  test("private execute readiness does not require live smoke approval", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");

    const response = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      can_execute: false,
      blocked_reasons: expect.arrayContaining(["server_token_provider_contract_only"]),
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(payload.blocked_reasons).not.toContain("live_smoke_approval_missing");
    expect(JSON.stringify(payload)).not.toContain("execute_live_smoke_approval");
    expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|client-secret|Authorization: Bearer/i);
  });

  test("execute readiness separates missing private approval from missing smoke approval", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");

    const missingConfirmation = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        smoke_approval: "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE"
      })
    }));
    expect(await json(missingConfirmation)).toMatchObject({
      can_execute: false,
      blocked_reasons: expect.arrayContaining(["upload_confirmation_missing", "private_execute_approval_missing"])
    });

    const missingSmokeApproval = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        execution_intent: "live_smoke"
      })
    }));
    expect(await json(missingSmokeApproval)).toMatchObject({
      can_execute: false,
      blocked_reasons: expect.arrayContaining(["live_smoke_approval_missing"])
    });
  });

  test("execute accepts dashboard smoke approval from request body before adapter validation", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");

    const response = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        execution_intent: "live_smoke",
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        smoke_approval: "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE"
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "BLOCKED_BY_YOUTUBE_READINESS",
      blocked_reasons: expect.arrayContaining(["server_token_provider_contract_only"]),
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(payload.blocked_reasons).not.toContain("live_smoke_approval_missing");
    expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|client-secret|Authorization: Bearer/i);
  });

  test("execute readiness blocks contract-only token provider before dashboard can execute", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");

    const response = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        smoke_approval: "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE"
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      can_execute: false,
      blocked_reasons: expect.arrayContaining(["server_token_provider_contract_only"]),
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(JSON.stringify(payload)).toContain("execute_token_provider");
    expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|client-secret|Authorization: Bearer/i);
  });

  test("execute route uses outside-repo local token file provider for mocked private upload", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-execute-token-"));
    const tokenPath = path.join(dir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: "access-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.upload"
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");
    vi.stubEnv("RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE", "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE");
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
        id: "youtube-video-route-token-provider",
        status: { privacyStatus: "private" }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
        method: "POST",
        body: JSON.stringify({
          ...validRequestBody,
          confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
          smoke_approval: "RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE"
        })
      }));
      const payload = await json(response);

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        blocked_reasons: [],
        result: {
          succeeded: true,
          youtube_video_id: "youtube-video-route-token-provider",
          token_refresh_attempted: false,
          side_effects: {
            external_api_called: true,
            youtube_upload_executed: true,
            uploaded: true,
            public_upload_enabled: false
          }
        }
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|client-secret|Authorization: Bearer/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("private execute readiness can pass with local token provider and no smoke approval", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "commerce-youtube-ready-token-"));
    const tokenPath = path.join(dir, "youtube-token.json");
    writeFileSync(
      tokenPath,
      JSON.stringify({
        access_token: "access-secret-value",
        scope: "https://www.googleapis.com/auth/youtube.upload"
      }),
      "utf8"
    );
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_LOCAL_TOKEN_FILE_PATH", tokenPath);
    vi.stubEnv("YOUTUBE_PRIVATE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const response = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
        method: "POST",
        body: JSON.stringify({
          ...validRequestBody,
          confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
          visibility: "private"
        })
      }));
      const payload = await json(response);

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        can_execute: true,
        blocked_reasons: [],
        side_effects: youtubeUploadSafeSideEffects
      });
      expect(JSON.stringify(payload)).not.toContain("execute_live_smoke_approval");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|client-secret|Authorization: Bearer/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("execute readiness blocks public and unlisted visibility for final private execute", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_PRIVATE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");

    const publicResponse = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        visibility: "public"
      })
    }));
    expect(await json(publicResponse)).toMatchObject({
      can_execute: false,
      blocked_reasons: expect.arrayContaining(["visibility_public_blocked"])
    });

    const unlistedResponse = await postYouTubeExecuteReadiness(new Request("http://localhost/api/uploads/youtube/execute-readiness", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        visibility: "unlisted"
      })
    }));
    expect(await json(unlistedResponse)).toMatchObject({
      can_execute: false,
      blocked_reasons: expect.arrayContaining(["visibility_unlisted_blocked"])
    });
  });

  test("public upload flag does not bypass upload-disabled or policy gates", () => {
    const readiness = buildYouTubeUploadReadiness({
      YOUTUBE_CLIENT_ID: "configured-client-id",
      YOUTUBE_CLIENT_SECRET: "configured-client-secret",
      YOUTUBE_TOKEN_PROVIDER: "configured-provider",
      YOUTUBE_TOKEN_READY: "true",
      YOUTUBE_SCOPES_READY: "true",
      YOUTUBE_QUOTA_READY: "true",
      YOUTUBE_ACCOUNT_READY: "true",
      YOUTUBE_POLICY_READY: "true",
      YOUTUBE_UPLOAD_ENABLED: "",
      YOUTUBE_PRIVATE_UPLOAD_ENABLED: "",
      PUBLIC_UPLOAD_ENABLED: "true"
    } as NodeJS.ProcessEnv);

    expect(readiness.can_upload).toBe(false);
    expect(readiness.blocked_reasons).toEqual(expect.arrayContaining([
      "upload_disabled",
      "public_upload_blocked",
      "policy_not_ready"
    ]));
  });

  test("execute route blocks unlisted visibility before adapter or videos.insert", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        visibility: "unlisted"
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
      missing_reasons: expect.arrayContaining(["visibility_unlisted_blocked"]),
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("execute readiness block returns top-level safe error and non-empty reasons", async () => {
    vi.stubEnv("YOUTUBE_CLIENT_ID", "configured-client-id");
    vi.stubEnv("YOUTUBE_CLIENT_SECRET", "configured-client-secret");
    vi.stubEnv("YOUTUBE_TOKEN_PROVIDER", "configured-provider");
    vi.stubEnv("YOUTUBE_TOKEN_READY", "true");
    vi.stubEnv("YOUTUBE_SCOPES_READY", "true");
    vi.stubEnv("YOUTUBE_UPLOAD_ENABLED", "true");
    vi.stubEnv("YOUTUBE_QUOTA_READY", "true");
    vi.stubEnv("YOUTUBE_ACCOUNT_READY", "true");
    vi.stubEnv("YOUTUBE_POLICY_READY", "true");
    vi.stubEnv("PUBLIC_UPLOAD_ENABLED", "false");

    const response = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "BLOCKED_BY_YOUTUBE_READINESS",
      safe_error: expect.any(String),
      blocked_reasons: expect.arrayContaining(["server_token_provider_contract_only"]),
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(JSON.stringify(payload)).toContain("execute_token_provider");
    expect(JSON.stringify(payload)).not.toContain("execute_live_smoke_approval");
    expect(JSON.stringify(payload)).not.toMatch(/refresh_token|access_token|client-secret|Authorization: Bearer/i);
  });

  test("execute route repairs package disclosure before readiness or external upload attempts", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await postYouTubeExecute(new Request("http://localhost/api/uploads/youtube/execute", {
      method: "POST",
      body: JSON.stringify({
        ...validRequestBody,
        confirmation: APPROVE_YOUTUBE_PRIVATE_UPLOAD,
        description: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????.",
        disclosure_text: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????."
      })
    }));
    const payload = await json(response);

    expect(response.status).toBe(403);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "BLOCKED_BY_YOUTUBE_READINESS",
      side_effects: youtubeUploadSafeSideEffects
    });
    expect(JSON.stringify(payload)).not.toContain("disclosure_text_garbled");
    expect(fetchMock).not.toHaveBeenCalled();
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
