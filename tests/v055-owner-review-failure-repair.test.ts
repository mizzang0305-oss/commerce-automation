import { describe, expect, test, vi } from "vitest";

import type { ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  evaluateV055ChannelRoutingHardGate
} from "../src/uploads/multi-channel/channelRoutingHardGate";
import {
  buildV055OwnerReviewFailureReport,
  V051_OWNER_REVIEW_FAILURE_VIDEO_IDS
} from "../src/uploads/multi-channel/ownerReviewFailureRepair";
import {
  buildAuthenticatedChannelProbe,
  type AuthenticatedChannelProbeResult
} from "../src/uploads/multi-channel/runtimeAuthenticatedChannelProbe";
import {
  buildV055HookTextOverlayPolicy,
  V055_CHANNEL_HOOK_TEXT
} from "../src/rendering/shorts/hookTextOverlayPolicy";
import {
  buildV055YouTubeVideoInsertBody,
  V055_COUPANG_PARTNERS_DISCLOSURE
} from "../src/uploads/youtube/youtubeDisclosurePayload";
import {
  verifyInsertedCommentVisibility
} from "../src/uploads/youtube/youtubeCommentVisibilityVerifier";

const CHANNELS: ChannelKey[] = ["father_jobs", "neoman_moleulgeol", "lets_buy"];

const TARGET_CHANNEL_IDS: Record<ChannelKey, string> = {
  father_jobs: "UC-father-target",
  neoman_moleulgeol: "UC-neoman-target",
  lets_buy: "UC-letsbuy-target"
};

const PROBES: Record<ChannelKey, AuthenticatedChannelProbeResult> = {
  father_jobs: okProbe("father_jobs", "father_jobs_youtube_account", TARGET_CHANNEL_IDS.father_jobs),
  neoman_moleulgeol: okProbe("neoman_moleulgeol", "neoman_moleulgeol_youtube_account", TARGET_CHANNEL_IDS.neoman_moleulgeol),
  lets_buy: okProbe("lets_buy", "lets_buy_youtube_account", TARGET_CHANNEL_IDS.lets_buy)
};

describe("v055 owner review failure repair", () => {
  test("records the v051 owner review failure without mutating existing videos", () => {
    const report = buildV055OwnerReviewFailureReport();

    expect(report).toMatchObject({
      version: "v055",
      owner_review_status: "OWNER_REVIEW_FAIL",
      one_channel_upload_detected: true,
      ai_disclosure_missing: true,
      comment_link_not_visible: true,
      hook_text_too_small: true,
      remediation_plan_created: true,
      existing_video_mutated: false,
      videos_insert_called: false,
      comment_create_update_delete_called: false,
      visibility_changed: false,
      new_upload_attempted: false,
      raw_urls_printed: false,
      secrets_printed: false,
      fake_success: false
    });
    expect(report.existing_videos).toEqual(V051_OWNER_REVIEW_FAILURE_VIDEO_IDS);
    expect(report.remediation_plan).toEqual(expect.arrayContaining([
      expect.stringContaining("wrong channel"),
      expect.stringContaining("AI use"),
      expect.stringContaining("paid product placement"),
      expect.stringContaining("missing comments"),
      expect.stringContaining("fresh re-upload approval")
    ]));
  });

  test("requires per-channel authenticated channel probe and blocks duplicate OAuth aliases", () => {
    expect(evaluateV055ChannelRoutingHardGate({
      routes: routes({ lets_buy: "shared_youtube_account" }),
      targetChannelIds: TARGET_CHANNEL_IDS,
      probes: {
        father_jobs: PROBES.father_jobs,
        neoman_moleulgeol: PROBES.neoman_moleulgeol,
        lets_buy: okProbe("lets_buy", "shared_youtube_account", TARGET_CHANNEL_IDS.lets_buy)
      }
    })).toMatchObject({
      routing_ready: false,
      blocker: "BLOCKED_RUNTIME_CHANNEL_ACCOUNT_MISMATCH"
    });

    expect(evaluateV055ChannelRoutingHardGate({
      routes: routes({
        father_jobs: "shared_youtube_account",
        neoman_moleulgeol: "shared_youtube_account"
      }),
      targetChannelIds: TARGET_CHANNEL_IDS,
      probes: {
        father_jobs: okProbe("father_jobs", "shared_youtube_account", TARGET_CHANNEL_IDS.father_jobs),
        neoman_moleulgeol: okProbe("neoman_moleulgeol", "shared_youtube_account", TARGET_CHANNEL_IDS.neoman_moleulgeol),
        lets_buy: PROBES.lets_buy
      }
    })).toMatchObject({
      routing_ready: false,
      blocker: "BLOCKED_DUPLICATE_OAUTH_ALIAS_FOR_MULTIPLE_CHANNELS"
    });

    expect(evaluateV055ChannelRoutingHardGate({
      routes: routes(),
      targetChannelIds: TARGET_CHANNEL_IDS,
      probes: {
        father_jobs: PROBES.father_jobs,
        neoman_moleulgeol: PROBES.neoman_moleulgeol
      }
    })).toMatchObject({
      routing_ready: false,
      blocker: "BLOCKED_AUTHENTICATED_CHANNEL_PROBE_MISSING"
    });

    const ready = evaluateV055ChannelRoutingHardGate({
      routes: routes(),
      targetChannelIds: TARGET_CHANNEL_IDS,
      probes: PROBES
    });
    expect(ready).toMatchObject({
      routing_ready: true,
      blocker: null,
      father_jobs_runtime_upload_account_matches_target: true,
      neoman_moleulgeol_runtime_upload_account_matches_target: true,
      lets_buy_runtime_upload_account_matches_target: true
    });
  });

  test("authenticated channel probe reads channels.list mine result without exposing token values", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      items: [{ id: TARGET_CHANNEL_IDS.father_jobs }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    const probe = await buildAuthenticatedChannelProbe({
      channelKey: "father_jobs",
      uploadAccountAlias: "father_jobs_youtube_account",
      accessToken: "mock-token-that-must-not-appear",
      fetchImpl
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0][0])).toContain("/youtube/v3/channels");
    expect(String(fetchImpl.mock.calls[0][0])).toContain("mine=true");
    expect(probe).toMatchObject({
      ok: true,
      channel_key: "father_jobs",
      upload_account_alias: "father_jobs_youtube_account",
      authenticated_channel_id: TARGET_CHANNEL_IDS.father_jobs,
      raw_token_printed: false,
      secrets_printed: false
    });
    expect(JSON.stringify(probe)).not.toContain("mock-token-that-must-not-appear");
  });

  test("video insert payload includes synthetic media and paid product placement flags", () => {
    const body = buildV055YouTubeVideoInsertBody({
      title: "실용 체크 - 차량용 컵홀더 정리함 #shorts",
      description: "상품 구성과 가격은 댓글 링크에서 확인하세요.",
      madeForKids: false,
      visibility: "public",
      containsSyntheticMedia: true,
      containsPaidPromotion: true
    });

    expect(body).toMatchObject({
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
        containsSyntheticMedia: true
      },
      paidProductPlacementDetails: {
        hasPaidProductPlacement: true
      }
    });
    expect(body.snippet.description).toContain("쿠팡 파트너스");
    expect(body.snippet.description).toContain("수수료");
  });

  test("post-insert comment verification requires readback affiliate link and disclosure visibility", async () => {
    const okFetch = vi.fn(async () => new Response(JSON.stringify({
      items: [{
        id: "comment-1",
        snippet: {
          topLevelComment: {
            snippet: {
              textOriginal: `상품 링크: https://example.test/affiliate\n${V055_COUPANG_PARTNERS_DISCLOSURE}`
            }
          }
        }
      }]
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    const ok = await verifyInsertedCommentVisibility({
      videoId: "video-1",
      commentId: "comment-1",
      expectedAffiliateUrl: "https://example.test/affiliate",
      accessToken: "mock-token-that-must-not-leak",
      fetchImpl: okFetch
    });
    expect(ok).toMatchObject({
      ok: true,
      blocker: null,
      affiliate_link_visible: true,
      coupang_disclosure_visible: true,
      raw_urls_printed: false,
      secrets_printed: false
    });
    expect(JSON.stringify(ok)).not.toContain("https://example.test/affiliate");
    expect(JSON.stringify(ok)).not.toContain("mock-token-that-must-not-leak");

    const missingLink = await verifyInsertedCommentVisibility({
      videoId: "video-1",
      commentId: "comment-1",
      expectedAffiliateUrl: "https://example.test/affiliate",
      accessToken: "mock-token-that-must-not-leak",
      fetchImpl: async () => new Response(JSON.stringify({
        items: [{
          id: "comment-1",
          snippet: {
            topLevelComment: {
              snippet: {
                textOriginal: V055_COUPANG_PARTNERS_DISCLOSURE
              }
            }
          }
        }]
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    });
    expect(missingLink.blocker).toBe("COMMENT_LINK_MISSING_AFTER_INSERT");
  });

  test("large hook overlay policy makes first two seconds mobile-readable for all channels", () => {
    const policy = buildV055HookTextOverlayPolicy();

    expect(policy.large_hook_overlay_policy_added).toBe(true);
    expect(policy.mobile_readability_gate_added).toBe(true);
    for (const channelKey of CHANNELS) {
      expect(policy.channel_hooks[channelKey]).toMatchObject({
        appears_within_seconds: 2,
        max_lines: 2,
        font_px_min: 60,
        font_px_max: 78,
        high_contrast_box: true,
        bold: true,
        safe_area: "upper_or_center_20_percent",
        product_name_first: false,
        mobile_readability_pass: true
      });
      expect(V055_CHANNEL_HOOK_TEXT[channelKey].length).toBeGreaterThan(8);
    }
  });
});

function routes(overrides: Partial<Record<ChannelKey, string>> = {}) {
  return CHANNELS.map((channelKey) => ({
    channel_key: channelKey,
    youtube_account_alias: `${channelKey}_youtube_account`,
    target_channel_id_or_handle: TARGET_CHANNEL_IDS[channelKey],
    resolved_upload_account_alias: overrides[channelKey] ?? `${channelKey}_youtube_account`,
    target_channel_configured: true,
    resolved_channel_id_or_handle_present: true,
    upload_account_matches_target: (overrides[channelKey] ?? `${channelKey}_youtube_account`) === `${channelKey}_youtube_account`,
    token_scope: "youtube.upload" as const,
    read_only_check_required_before_v051: true as const,
    secret_safe: true as const,
    blocker: null
  }));
}

function okProbe(
  channelKey: ChannelKey,
  uploadAccountAlias: string,
  channelId: string
): AuthenticatedChannelProbeResult {
  return {
    ok: true,
    channel_key: channelKey,
    upload_account_alias: uploadAccountAlias,
    authenticated_channel_id: channelId,
    probe_performed: true,
    raw_token_printed: false,
    secrets_printed: false,
    blocker: null
  };
}
