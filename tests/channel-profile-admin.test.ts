import { beforeEach, describe, expect, test } from "vitest";
import { GET as getChannels } from "../app/api/channels/route";
import { PATCH as patchChannel } from "../app/api/channels/[id]/route";
import { getAutomationRepository, resetMockRepositoryForTests } from "@/lib/repositories/automationRepository";

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/channels/channel-coupang-daily", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("channel profile admin readiness", () => {
  beforeEach(() => {
    resetMockRepositoryForTests();
    process.env.YOUTUBE_CLIENT_ID = "client-id-secret";
    process.env.YOUTUBE_CLIENT_SECRET = "client-secret-secret";
    process.env.YOUTUBE_REDIRECT_URI = "https://example.com/oauth/callback";
  });

  test("GET /api/channels returns manual-only profiles and safe OAuth readiness", async () => {
    const response = await getChannels();
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.youtube).toMatchObject({
      oauth_configured: true,
      upload_enabled: false,
      manual_upload_only: true
    });
    expect(serialized).not.toContain("client-secret-secret");
    expect(serialized).not.toContain("client-id-secret");
    expect(serialized).not.toContain("YOUTUBE_CLIENT_SECRET");
    expect(serialized).not.toContain("SUPABASE_SERVICE_ROLE_KEY");

    const profiles = payload.channel_profiles as Array<Record<string, unknown>>;
    expect(profiles.length).toBeGreaterThan(0);
    expect(profiles[0]).toMatchObject({
      upload_enabled: false,
      manual_upload_only: true
    });
  });

  test("PATCH /api/channels/[id] updates safe fields but cannot enable uploads", async () => {
    const repository = getAutomationRepository();
    const beforeJobs = await repository.getWorkerJobs();

    const response = await patchChannel(
      patchRequest({
        channel_name: "쿠팡 데일리 운영 채널",
        youtube_channel_id: "UC_TEST_CHANNEL",
        youtube_handle: "@commerce-test",
        title_template: "{product_name} 핵심 체크",
        description_template: "{description}\n\n{affiliate_url}",
        hashtag_template: "#쿠팡추천 #쇼츠",
        pinned_comment_template: "구매 전 가격과 옵션을 확인하세요.",
        allowed_categories: ["생활", "주방"],
        excluded_categories: ["의약품"],
        upload_window: { start_hour: 10, end_hour: 18 },
        upload_enabled: true,
        manual_upload_only: false,
        oauth_refresh_token: "must-not-store"
      }),
      routeContext("channel-coupang-daily")
    );
    const payload = await readJson(response);
    const serialized = JSON.stringify(payload);
    const profile = await repository.getChannelProfile("channel-coupang-daily");
    const afterJobs = await repository.getWorkerJobs();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(profile).toMatchObject({
      channel_name: "쿠팡 데일리 운영 채널",
      youtube_channel_id: "UC_TEST_CHANNEL",
      youtube_handle: "@commerce-test",
      title_template: "{product_name} 핵심 체크",
      upload_enabled: false,
      manual_upload_only: true
    });
    expect(profile?.allowed_categories).toEqual(["생활", "주방"]);
    expect(profile?.excluded_categories).toEqual(["의약품"]);
    expect(serialized).not.toContain("must-not-store");
    expect(serialized).not.toContain("oauth_refresh_token");
    expect(afterJobs).toHaveLength(beforeJobs.length);
  });

  test("PATCH /api/channels/[id] returns 404 for unknown profiles", async () => {
    const response = await patchChannel(
      patchRequest({ channel_name: "missing" }),
      routeContext("channel-missing")
    );
    const payload = await readJson(response);

    expect(response.status).toBe(404);
    expect(payload).toMatchObject({
      ok: false,
      error_code: "CHANNEL_PROFILE_NOT_FOUND"
    });
  });
});
