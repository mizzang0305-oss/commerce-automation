import { describe, expect, test } from "vitest";
import { signedTestReview, TEST_REVIEW_PUBLIC_KEY } from "../fixtures/productVisualReview";
import {
  InMemoryYouTubePublicPublisherStore,
  enqueueYouTubePublicUploadJob,
  runYouTubePublicPublisherOnce,
  type YouTubePublicUploadJob,
  type YouTubePublicPublisherClient
} from "@/lib/youtube-public-publisher/publisher";

function readyJob(): YouTubePublicUploadJob {
  const productId = "coupang:product:100:item:200:vendor:300";
  return {
    id: "job-new-product",
    productId,
    channelKey: "father_jobs",
    videoPath: "D:\\render\\product-new.mp4",
    videoSha256: "a".repeat(64),
    affiliateUrl: "https://link.coupang.com/a/example",
    affiliateProductId: productId,
    canonicalProductName: "검증 상품",
    metadataProductName: "검증 상품",
    title: "검증 상품 Shorts",
    description: "https://link.coupang.com/a/example\n쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.",
    disclosureText: "쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다.",
    machineQaStatus: "passed",
    productVisualReview: signedTestReview(productId, "a".repeat(64)),
    status: "ready",
    attemptCount: 0,
    claimedAt: "",
    claimOwner: "",
    lastError: "",
    youtubeVideoId: "",
    youtubeUrl: "",
    publishedAt: "",
    createdAt: "2026-09-22T00:00:00.000Z",
    updatedAt: "2026-09-22T00:00:00.000Z"
  };
}

describe("guarded run-once public publisher", () => {
  test("accepts a ready job once and rejects its duplicate identity", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [], ledger: [] });

    await expect(enqueueYouTubePublicUploadJob(store, readyJob())).resolves.toMatchObject({ created: true });
    await expect(enqueueYouTubePublicUploadJob(store, { ...readyJob(), id: "same-video-new-id" })).resolves.toMatchObject({
      created: false,
      safeError: "DUPLICATE_UPLOAD_JOB"
    });
  });

  test("rejects reuse across product IDs or channels even when only the file or product matches", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    const otherProduct = "coupang:product:101:item:201:vendor:301";
    await expect(enqueueYouTubePublicUploadJob(store, {
      ...readyJob(), id: "different-product-same-bytes", productId: otherProduct, affiliateProductId: otherProduct,
      channelKey: "neoman_moleulgeol", productVisualReview: signedTestReview(otherProduct, "a".repeat(64))
    })).resolves.toMatchObject({ created: false, safeError: "DUPLICATE_UPLOAD_JOB" });
    await expect(enqueueYouTubePublicUploadJob(store, {
      ...readyJob(), id: "same-product-different-bytes", videoSha256: "b".repeat(64),
      productVisualReview: signedTestReview("coupang:product:100:item:200:vendor:300", "b".repeat(64))
    })).resolves.toMatchObject({ created: false, safeError: "DUPLICATE_UPLOAD_JOB" });
  });

  test("uploads one valid ready job only after readback and persists its ledger entry", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    const client: YouTubePublicPublisherClient = {
      getAccessToken: async () => ({ ok: true, accessToken: "test-access-token" }),
      probeMineChannel: async () => ({ ok: true, channelId: "UC38rroV6ZRTIzqKgWr5vWrw", channelTitle: "father jobs" }),
      insertPublicVideo: async () => ({ ok: true, youtubeVideoId: "new-video-id" }),
      readbackVideo: async () => ({
        ok: true,
        channelId: "UC38rroV6ZRTIzqKgWr5vWrw",
        privacyStatus: "public",
        title: "검증 상품 Shorts",
        description: "https://link.coupang.com/a/example\n쿠팡파트너스 활동의 일환으로 일정액의 수수료를 제공받을 수 있습니다."
      })
    };

    const result = await runYouTubePublicPublisherOnce({
      store,
      client,
      getVideoSha256: async () => "a".repeat(64),
      env: {
        YOUTUBE_PUBLIC_PUBLISHER_ENABLED: "true",
        PRODUCT_CONTENT_REVIEW_PUBLIC_KEY: TEST_REVIEW_PUBLIC_KEY,
        YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE: "D:\\secure\\youtube-neoman.json",
        YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE: "D:\\secure\\youtube-father.json"
      },
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });

    expect(result.status).toBe("uploaded");
    expect(result.videosInsertCalls).toBe(1);
    expect(store.snapshot().jobs[0]).toMatchObject({ status: "uploaded", youtubeVideoId: "new-video-id" });
    expect(store.snapshot().ledger).toEqual(expect.arrayContaining([
      expect.objectContaining({
        channelKey: "father_jobs",
        productId: "coupang:product:100:item:200:vendor:300",
        videoSha256: "a".repeat(64),
        youtubeVideoId: "new-video-id",
        visibility: "public"
      })
    ]));
  });

  test("retries a proven pre-insert transient failure once, then requires manual review", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    const client: YouTubePublicPublisherClient = {
      getAccessToken: async () => ({ ok: true, accessToken: "test-access-token" }),
      probeMineChannel: async () => ({ ok: true, channelId: "UC38rroV6ZRTIzqKgWr5vWrw", channelTitle: "father jobs" }),
      insertPublicVideo: async () => ({ ok: false, safeError: "YOUTUBE_PRE_INSERT_TRANSIENT", retryable: true }),
      readbackVideo: async () => ({ ok: false, safeError: "NOT_REACHED" })
    };
    const input = {
      store,
      client,
      getVideoSha256: async () => "a".repeat(64),
      env: {
        YOUTUBE_PUBLIC_PUBLISHER_ENABLED: "true",
        PRODUCT_CONTENT_REVIEW_PUBLIC_KEY: TEST_REVIEW_PUBLIC_KEY,
        YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE: "D:\\secure\\youtube-neoman.json",
        YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE: "D:\\secure\\youtube-father.json",
        YOUTUBE_PUBLIC_PUBLISHER_MAX_AUTO_RETRY: "999"
      },
      claimOwner: "test-publisher"
    };

    await expect(runYouTubePublicPublisherOnce({ ...input, now: "2026-09-22T01:00:00.000Z" })).resolves.toMatchObject({
      status: "retry_scheduled",
      videosInsertCalls: 1
    });
    expect(store.snapshot().jobs[0]).toMatchObject({ status: "ready", attemptCount: 1 });

    await expect(runYouTubePublicPublisherOnce({ ...input, now: "2026-09-22T02:00:00.000Z" })).resolves.toMatchObject({
      status: "manual_review",
      videosInsertCalls: 1
    });
    expect(store.snapshot().jobs[0]).toMatchObject({ status: "manual_review", attemptCount: 2 });
  });

  test("blocks a channel identity mismatch before videos.insert", async () => {
    let insertCalls = 0;
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: {
        getAccessToken: async () => ({ ok: true, accessToken: "test-access-token" }),
        probeMineChannel: async () => ({ ok: true, channelId: "wrong-channel", channelTitle: "wrong channel" }),
        insertPublicVideo: async () => {
          insertCalls += 1;
          return { ok: true, youtubeVideoId: "must-not-upload" };
        },
        readbackVideo: async () => ({ ok: false, safeError: "NOT_REACHED" })
      },
      getVideoSha256: async () => "a".repeat(64),
      env: publisherEnv(),
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });

    expect(result).toMatchObject({ status: "manual_review", safeError: "CHANNEL_IDENTITY_MISMATCH", videosInsertCalls: 0 });
    expect(insertCalls).toBe(0);
  });

  test("blocks a channel title mismatch before videos.insert", async () => {
    let insertCalls = 0;
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: {
        getAccessToken: async () => ({ ok: true, accessToken: "test-access-token" }),
        probeMineChannel: async () => ({ ok: true, channelId: "UC38rroV6ZRTIzqKgWr5vWrw", channelTitle: "unexpected title" }),
        insertPublicVideo: async () => {
          insertCalls += 1;
          return { ok: true, youtubeVideoId: "must-not-upload" };
        },
        readbackVideo: async () => ({ ok: false, safeError: "NOT_REACHED" })
      },
      getVideoSha256: async () => "a".repeat(64),
      env: publisherEnv(),
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });

    expect(result).toMatchObject({ status: "manual_review", safeError: "CHANNEL_IDENTITY_MISMATCH", videosInsertCalls: 0 });
    expect(insertCalls).toBe(0);
  });

  const invalidJobPatches: ReadonlyArray<[string, Partial<YouTubePublicUploadJob>, string]> = [
    ["machine QA", { machineQaStatus: "failed" }, "MACHINE_QA_NOT_PASS"],
    ["affiliate", { affiliateUrl: "" }, "AFFILIATE_PRODUCT_MISMATCH"],
    ["disclosure", { disclosureText: "" }, "METADATA_OR_DISCLOSURE_NOT_READY"],
    ["content review", { productVisualReview: undefined }, "PRODUCT_CONTENT_REVIEW_MISSING"],
    ["tampered review", { productVisualReview: { ...signedTestReview("coupang:product:100:item:200:vendor:300", "a".repeat(64)), evidenceId: "tampered" } }, "PRODUCT_CONTENT_REVIEW_SIGNATURE_INVALID"]
  ];

  test.each(invalidJobPatches)("blocks missing %s before videos.insert", async (_label, patch, safeError) => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [{ ...readyJob(), ...patch }], ledger: [] });
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: unreachableClient(),
      getVideoSha256: async () => "a".repeat(64),
      env: publisherEnv(),
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });

    expect(result).toMatchObject({ status: "manual_review", safeError, videosInsertCalls: 0 });
  });

  test("fails closed when video bytes change after claim and before insert", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    let hashReads = 0;
    let inserts = 0;
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: {
        getAccessToken: async () => ({ ok: true, accessToken: "test-access-token" }),
        probeMineChannel: async () => ({ ok: true, channelId: "UC38rroV6ZRTIzqKgWr5vWrw", channelTitle: "father jobs" }),
        insertPublicVideo: async () => { inserts++; throw new Error("must not insert changed bytes"); },
        readbackVideo: async () => { throw new Error("must not read back"); }
      },
      getVideoSha256: async () => ++hashReads === 1 ? "a".repeat(64) : "b".repeat(64),
      env: publisherEnv(), now: "2026-09-22T01:00:00.000Z", claimOwner: "test-publisher"
    });
    expect(result).toMatchObject({ status: "manual_review", safeError: "VIDEO_HASH_MISMATCH", videosInsertCalls: 0 });
    expect(hashReads).toBe(2);
    expect(inserts).toBe(0);
  });

  test("re-hashes the current file and blocks a changed video before videos.insert", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: unreachableClient(),
      getVideoSha256: async () => "b".repeat(64),
      env: publisherEnv(),
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });
    expect(result).toMatchObject({ status: "manual_review", safeError: "VIDEO_HASH_MISMATCH", videosInsertCalls: 0 });
  });

  test("re-hashes again after channel identity and blocks a late file change", async () => {
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger: [] });
    let hashChecks = 0;
    let insertCalls = 0;
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: {
        getAccessToken: async () => ({ ok: true, accessToken: "test-access-token" }),
        probeMineChannel: async () => ({ ok: true, channelId: "UC38rroV6ZRTIzqKgWr5vWrw", channelTitle: "father jobs" }),
        insertPublicVideo: async () => { insertCalls += 1; throw new Error("must not upload"); },
        readbackVideo: async () => { throw new Error("must not read back"); }
      },
      getVideoSha256: async () => (++hashChecks === 1 ? "a" : "b").repeat(64),
      env: publisherEnv(),
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });
    expect(hashChecks).toBe(2);
    expect(insertCalls).toBe(0);
    expect(result).toMatchObject({ status: "manual_review", safeError: "VIDEO_HASH_MISMATCH", videosInsertCalls: 0 });
  });

  test("imports verified canaries idempotently and blocks their duplicate identity", async () => {
    const canaryJob = {
      ...readyJob(),
      id: "duplicate-father-canary",
      productId: "coupang:product:9143629055:item:26916966994:vendor:93885777552",
      affiliateProductId: "coupang:product:9143629055:item:26916966994:vendor:93885777552",
      videoSha256: "FDB233175C9B62FEB1A62D63A11DAF9E2FE533EB036C89F00B956A002F142104"
    };
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [canaryJob], ledger: [] });

    const first = await runYouTubePublicPublisherOnce({
      store,
      client: unreachableClient(),
      getVideoSha256: async () => canaryJob.videoSha256,
      env: publisherEnv({ YOUTUBE_PUBLIC_PUBLISHER_MAX_DAILY_UPLOADS_TOTAL: "999", YOUTUBE_PUBLIC_PUBLISHER_MAX_DAILY_UPLOADS_PER_CHANNEL: "999" }),
      now: "2026-09-22T01:00:00.000Z",
      claimOwner: "test-publisher"
    });
    const second = await runYouTubePublicPublisherOnce({
      store,
      client: unreachableClient(),
      getVideoSha256: async () => canaryJob.videoSha256,
      env: publisherEnv(),
      now: "2026-09-22T02:00:00.000Z",
      claimOwner: "test-publisher"
    });

    expect(first).toMatchObject({ status: "manual_review", safeError: "DUPLICATE_UPLOAD", videosInsertCalls: 0, canariesImported: 2 });
    expect(second).toMatchObject({ status: "no_ready_job", videosInsertCalls: 0, canariesImported: 0 });
  });

  test.each([
    ["total", 3, 1, "DAILY_UPLOAD_CAP_REACHED"],
    ["channel", 2, 0, "CHANNEL_DAILY_UPLOAD_CAP_REACHED"]
  ])("blocks %s daily cap before videos.insert", async (_label, totalEntries, otherChannelEntries, safeError) => {
    const publishedAt = "2026-09-22T01:00:00.000Z";
    const ledger = Array.from({ length: totalEntries }, (_, index) => ({
      channelKey: index < otherChannelEntries ? "neoman_moleulgeol" as const : "father_jobs" as const,
      channelId: index < otherChannelEntries ? "UCOdvPLaFnvzAI-_VyIXTdOw" : "UC38rroV6ZRTIzqKgWr5vWrw",
      productId: `prior-${index}`,
      videoSha256: `${index}`.padStart(64, "0"),
      youtubeVideoId: `prior-video-${index}`,
      youtubeUrl: `https://youtu.be/prior-video-${index}`,
      visibility: "public" as const,
      publishedAt,
      recordedAt: publishedAt
    }));
    const store = new InMemoryYouTubePublicPublisherStore({ jobs: [readyJob()], ledger });
    const result = await runYouTubePublicPublisherOnce({
      store,
      client: unreachableClient(),
      getVideoSha256: async () => "a".repeat(64),
      env: publisherEnv(),
      now: "2026-09-22T02:00:00.000Z",
      claimOwner: "test-publisher"
    });

    expect(result).toMatchObject({ status: "manual_review", safeError, videosInsertCalls: 0 });
  });
});

function publisherEnv(overrides: Record<string, string> = {}) {
  return {
    YOUTUBE_PUBLIC_PUBLISHER_ENABLED: "true",
    PRODUCT_CONTENT_REVIEW_PUBLIC_KEY: TEST_REVIEW_PUBLIC_KEY,
    YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE: "D:\\secure\\youtube-neoman.json",
    YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE: "D:\\secure\\youtube-father.json",
    ...overrides
  };
}

function unreachableClient(): YouTubePublicPublisherClient {
  return {
    getAccessToken: async () => {
      throw new Error("must not reach token provider");
    },
    probeMineChannel: async () => {
      throw new Error("must not probe YouTube");
    },
    insertPublicVideo: async () => {
      throw new Error("must not upload");
    },
    readbackVideo: async () => {
      throw new Error("must not read back");
    }
  };
}
