import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runSimpleProducerOnce } from "@/lib/simple-producer/producer";
import { InMemorySimpleProducerStore } from "@/lib/simple-producer/state";
import type { SimpleProducerConfig, SimpleProducerPipelineResult } from "@/lib/simple-producer/types";
import { InMemoryYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/publisher";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const config: SimpleProducerConfig = {
  schema: "simple-producer/v1",
  enabled: true,
  dailyGenerateTarget: 3,
  maxItemsPerRun: 1,
  generationSlots: ["09:00", "15:00", "21:00"],
  timeZone: "Asia/Seoul",
  evidenceRoot: "D:\\secure\\simple-producer-evidence"
};

describe("simple producer run-once", () => {
  test("creates exactly one ready job after machine QA and never calls videos.insert", async () => {
    const videoPath = await createVideo();
    const producerStore = new InMemorySimpleProducerStore();
    const publisherStore = new InMemoryYouTubePublicPublisherStore({ jobs: [], ledger: [] });
    let calls = 0;

    const result = await runSimpleProducerOnce({
      config,
      producerStore,
      publisherStore,
      now: new Date("2026-09-23T00:00:00.000Z"),
      executePipeline: async () => {
        calls += 1;
        return passedPipeline(videoPath);
      }
    });

    expect(result).toMatchObject({ status: "ready_job_created", readyJobCreated: 1, videosInsertCalls: 0, channelKey: "neoman_moleulgeol" });
    expect(calls).toBe(1);
    expect((await publisherStore.read()).jobs).toEqual([
      expect.objectContaining({ status: "ready", machineQaStatus: "passed", canonicalProductName: "검증 빨래 건조대", metadataProductName: "검증 빨래 건조대" })
    ]);
    expect((await producerStore.read()).slots).toEqual([expect.objectContaining({ status: "succeeded", slot: "09:00" })]);
  });

  test("records a failed slot and does not retry that product slot", async () => {
    const producerStore = new InMemorySimpleProducerStore();
    const publisherStore = new InMemoryYouTubePublicPublisherStore({ jobs: [], ledger: [] });
    let calls = 0;
    const input = {
      config,
      producerStore,
      publisherStore,
      now: new Date("2026-09-23T06:00:00.000Z"),
      executePipeline: async (): Promise<SimpleProducerPipelineResult> => {
        calls += 1;
        return { ok: false, safeError: "SIMPLE_PRODUCER_RENDER_FAILED", searchCalls: 3, rawProductsFound: 10, eligibleProductsFound: 4, item: null };
      }
    };

    await expect(runSimpleProducerOnce(input)).resolves.toMatchObject({ status: "failed", safeError: "SIMPLE_PRODUCER_RENDER_FAILED", videosInsertCalls: 0 });
    await expect(runSimpleProducerOnce(input)).resolves.toMatchObject({ status: "slot_already_recorded", videosInsertCalls: 0 });
    expect(calls).toBe(1);
    expect((await publisherStore.read()).jobs).toHaveLength(0);
  });

  test("does not run outside a configured slot or backfill after 21:00", async () => {
    const producerStore = new InMemorySimpleProducerStore();
    const publisherStore = new InMemoryYouTubePublicPublisherStore({ jobs: [], ledger: [] });
    const executePipeline = async (): Promise<SimpleProducerPipelineResult> => {
      throw new Error("must not run");
    };

    await expect(runSimpleProducerOnce({ config, producerStore, publisherStore, now: new Date("2026-09-23T01:30:00.000Z"), executePipeline })).resolves.toMatchObject({ status: "outside_slot", videosInsertCalls: 0 });
    await expect(runSimpleProducerOnce({ config, producerStore, publisherStore, now: new Date("2026-09-23T13:15:00.000Z"), executePipeline })).resolves.toMatchObject({ status: "outside_slot", videosInsertCalls: 0 });
  });

  test("passes previously queued and published products to the pipeline exclusion contract", async () => {
    const videoPath = await createVideo();
    const producerStore = new InMemorySimpleProducerStore();
    const publisherStore = new InMemoryYouTubePublicPublisherStore({
      jobs: [{ ...readyJob(videoPath), id: "queued", productId: "queued-product", affiliateProductId: "queued-product" }],
      ledger: [{ channelKey: "father_jobs", channelId: "channel", productId: "published-product", videoSha256: "a".repeat(64), youtubeVideoId: "prior", youtubeUrl: "https://youtu.be/prior", visibility: "public", publishedAt: "2026-09-20T00:00:00.000Z", recordedAt: "2026-09-20T00:00:00.000Z" }]
    });
    let excluded: string[] = [];
    const result = await runSimpleProducerOnce({
      config,
      producerStore,
      publisherStore,
      now: new Date("2026-09-23T06:00:00.000Z"),
      executePipeline: async (input) => {
        excluded = input.excludedProductIds;
        return passedPipeline(videoPath, "new-product");
      }
    });

    expect(result.status).toBe("ready_job_created");
    expect(excluded).toEqual(["published-product", "queued-product"]);
  });
});

async function createVideo() {
  const root = await mkdtemp(join(tmpdir(), "simple-producer-"));
  roots.push(root);
  const videoPath = join(root, "video.mp4");
  await writeFile(videoPath, "test-video", "utf8");
  return videoPath;
}

function passedPipeline(videoPath: string, productId = "new-product"): SimpleProducerPipelineResult {
  return {
    ok: true,
    safeError: "",
    searchCalls: 3,
    rawProductsFound: 10,
    eligibleProductsFound: 4,
    item: { productId, canonicalProductName: "검증 빨래 건조대", affiliateUrl: "https://link.coupang.com/a/example", useCase: "laundry_drying", videoPath, machineQaPassed: true }
  };
}

function readyJob(videoPath: string) {
  return {
    id: "existing",
    productId: "existing-product",
    channelKey: "father_jobs" as const,
    videoPath,
    videoSha256: "a".repeat(64),
    affiliateUrl: "https://link.coupang.com/a/existing",
    affiliateProductId: "existing-product",
    canonicalProductName: "기존 상품",
    metadataProductName: "기존 상품",
    title: "기존 상품",
    description: "https://link.coupang.com/a/existing\n고지",
    disclosureText: "고지",
    machineQaStatus: "passed" as const,
    status: "ready" as const,
    attemptCount: 0,
    claimedAt: "",
    claimOwner: "",
    lastError: "",
    youtubeVideoId: "",
    youtubeUrl: "",
    publishedAt: "",
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z"
  };
}
