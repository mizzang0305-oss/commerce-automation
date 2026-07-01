import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  V051_PAID_PROMOTION_CONFIRMATION_PHRASE,
  V051_UPLOAD_APPROVAL_PHRASE
} from "../src/uploads/multi-channel/v051ApprovalAliasWrapper";
import {
  executeV051MutationEnabledUploads
} from "../src/uploads/multi-channel/v051MutationEnabledExecutor";
import {
  buildV054RuntimeYouTubeAdapterReadiness,
  createV054RuntimeYouTubeAdapters,
  resolveV054RuntimeChannelAccountRoutes
} from "../src/uploads/multi-channel/v054RuntimeYouTubeAdapterFactory";

const APPROVAL_TEXT = `${V051_UPLOAD_APPROVAL_PHRASE}\n${V051_PAID_PROMOTION_CONFIRMATION_PHRASE}`;
const AFFILIATE_URLS = {
  father_jobs: "TEST_AFFILIATE_FATHER",
  neoman_moleulgeol: "TEST_AFFILIATE_NEOMAN",
  lets_buy: "TEST_AFFILIATE_LETS_BUY"
} as const;
const SECRET_NEEDLES = /TEST_AFFILIATE_|access_token|refresh_token|client_secret|Authorization|Bearer/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v054-"));
}

async function writeV048Videos(cwd: string) {
  for (const channelKey of Object.keys(AFFILIATE_URLS)) {
    const videoPath = path.join(cwd, "commerce-assets", "review", "v048", channelKey, "local-review-video.mp4");
    await mkdir(path.dirname(videoPath), { recursive: true });
    await writeFile(videoPath, `fake-${channelKey}-mp4-bytes`, "utf8");
  }
}

function mockYouTubeFetch() {
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("/upload/youtube/v3/videos")) {
      return new Response(null, {
        status: 200,
        headers: { Location: `https://upload.youtube.test/session-${fetchMock.mock.calls.length}` }
      });
    }
    if (href.includes("upload.youtube.test")) {
      return new Response(JSON.stringify({ id: `video-${fetchMock.mock.calls.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (href.includes("/youtube/v3/commentThreads")) {
      return new Response(JSON.stringify({ id: `comment-${fetchMock.mock.calls.length}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    throw new Error(`Unexpected fetch URL: ${href}`);
  });
  return fetchMock;
}

describe("v054 runtime YouTube adapter factory", () => {
  test("runtime readiness reports factories, guards, routing, and no external side effects", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const fetchMock = mockYouTubeFetch();

      const readiness = await buildV054RuntimeYouTubeAdapterReadiness({
        cwd,
        env: {
          PRIVATE_TEST_SENTINEL: "private-value-that-must-not-leak",
          YOUTUBE_LOCAL_TOKEN_FILE_PATH: "C:/outside/token.json"
        } as NodeJS.ProcessEnv,
        fetchImpl: fetchMock
      });

      expect(readiness).toMatchObject({
        version: "v054",
        FINAL_STATUS: "SUCCESS_V054_RUNTIME_YOUTUBE_ADAPTERS_READY_NO_UPLOAD",
        V054_RUNTIME_ADAPTERS_READY: true,
        CHANNEL_ROUTING_READY: true,
        SAFE_TO_UPLOAD: false,
        upload_adapter_factory_ready: true,
        comment_adapter_factory_ready: true,
        token_provider_factory_ready: true,
        channel_account_router_factory_ready: true,
        duplicate_upload_guard_wired: true,
        metadata_gate_wired: true,
        youtube_execute_called: false,
        videos_insert_called: false,
        comment_create_update_delete_called: false,
        raw_urls_printed: false,
        secrets_printed: false
      });
      expect(readiness.routes.map((route) => route.youtube_account_alias)).toEqual([
        "father_jobs_youtube_account",
        "neoman_moleulgeol_youtube_account",
        "lets_buy_youtube_account"
      ]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(readiness)).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("mutation_enabled v051 executor uses runtime adapters with mocked token and fetch only", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const fetchMock = mockYouTubeFetch();
      const tokenProvider = vi.fn(async () => ({
        ok: true as const,
        accessToken: "mock-access-token",
        token_refresh_attempted: false,
        token_refresh_succeeded: false,
        token_file_updated: false
      }));
      const factory = await createV054RuntimeYouTubeAdapters({
        cwd,
        fetchImpl: fetchMock,
        accessTokenProvider: tokenProvider
      });

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: factory.adapters,
        safetyOverrides: factory.safetyOverrides
      });

      expect(result).toMatchObject({
        FINAL_STATUS: "SUCCESS_V051_THREE_CHANNEL_PUBLIC_UPLOADS_DONE",
        mutation_blocker: null,
        father_jobs_uploaded: true,
        neoman_moleulgeol_uploaded: true,
        lets_buy_uploaded: true,
        father_jobs_visibility: "public",
        neoman_moleulgeol_visibility: "public",
        lets_buy_visibility: "public",
        videos_insert_total_count: 3,
        comment_create_total_count: 3,
        youtube_execute_called: true,
        videos_insert_called: true,
        comment_create_update_delete_called: true,
        raw_urls_printed: false,
        secrets_printed: false,
        fake_success: false
      });
      expect(tokenProvider).toHaveBeenCalledTimes(6);
      expect(fetchMock).toHaveBeenCalledTimes(9);
      expect(JSON.stringify(result)).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runtime token provider not ready blocks before videos.insert or comment calls", async () => {
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const fetchMock = mockYouTubeFetch();
      const factory = await createV054RuntimeYouTubeAdapters({
        cwd,
        fetchImpl: fetchMock,
        accessTokenProvider: async () => ({
          ok: false as const,
          blocked_reasons: ["token_not_ready"],
          safe_error: "Token provider is not ready.",
          external_api_called: false
        })
      });

      const result = await executeV051MutationEnabledUploads({
        cwd,
        executionMode: "mutation_enabled",
        approvalText: APPROVAL_TEXT,
        affiliateUrls: AFFILIATE_URLS,
        adapters: factory.adapters,
        safetyOverrides: factory.safetyOverrides
      });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V053_MUTATION_ENABLED_V051_EXECUTOR");
      expect(result.mutation_blocker).toBe("RUNTIME_TOKEN_PROVIDER_NOT_READY");
      expect(result.videos_insert_total_count).toBe(0);
      expect(result.comment_create_total_count).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toMatch(SECRET_NEEDLES);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runtime routing rejects one OAuth account silently serving all three channels", async () => {
    const routes = resolveV054RuntimeChannelAccountRoutes({
      father_jobs: "shared_youtube_account",
      neoman_moleulgeol: "shared_youtube_account",
      lets_buy: "shared_youtube_account"
    });
    const cwd = await makeCwd();
    try {
      await writeV048Videos(cwd);
      const readiness = await buildV054RuntimeYouTubeAdapterReadiness({ cwd, routes });

      expect(readiness.CHANNEL_ROUTING_READY).toBe(false);
      expect(readiness.channel_routing_blocker).toBe("SINGLE_OAUTH_TOKEN_THREE_CHANNEL_RISK");
      expect(readiness.V054_RUNTIME_ADAPTERS_READY).toBe(false);
      expect(readiness.upload_attempted).toBe(false);
      expect(readiness.videos_insert_called).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
