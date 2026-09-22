import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCommerceStudioModel } from "@/lib/commerce-studio/readModel";
import { isCommerceStudioEnabled } from "@/lib/commerce-studio/featureFlag";

const originalConfigPath = process.env.SIMPLE_PRODUCER_CONFIG_PATH;
const originalPublisherPath = process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH;
const roots: string[] = [];

afterEach(async () => {
  if (originalConfigPath === undefined) delete process.env.SIMPLE_PRODUCER_CONFIG_PATH;
  else process.env.SIMPLE_PRODUCER_CONFIG_PATH = originalConfigPath;
  if (originalPublisherPath === undefined) delete process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH;
  else process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH = originalPublisherPath;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe.sequential("Commerce Studio read model", () => {
  it("is available in protected Preview and off in Production by default", () => {
    expect(isCommerceStudioEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isCommerceStudioEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(isCommerceStudioEnabled({ VERCEL_ENV: "preview", COMMERCE_STUDIO_ENABLED: "false" })).toBe(false);
  });

  it("keeps unavailable sources unknown instead of inventing zero activity", async () => {
    delete process.env.SIMPLE_PRODUCER_CONFIG_PATH;
    delete process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH;
    const model = await readCommerceStudioModel(new Date("2026-09-23T00:00:00.000Z"));
    expect(model.producerSource).toBe("unavailable");
    expect(model.publisherSource).toBe("unavailable");
    expect(model.settings).toBeNull();
    expect(model.slots).toEqual([]);
    expect(model.contents).toEqual([]);
  });

  it("joins observed slot and publisher job without assigning products to future slots", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-read-model-"));
    roots.push(root);
    const configPath = join(root, "config.json");
    const publisherPath = join(root, "publisher.json");
    process.env.SIMPLE_PRODUCER_CONFIG_PATH = configPath;
    process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH = publisherPath;
    await writeFile(configPath, JSON.stringify({
      schema: "simple-producer/v1", enabled: true, dailyGenerateTarget: 2,
      maxItemsPerRun: 1, generationSlots: ["09:00", "15:00"],
      timeZone: "Asia/Seoul", evidenceRoot: root
    }));
    await writeFile(join(root, "simple-producer-state.json"), JSON.stringify({
      schema: "simple-producer/v1", slots: [{
        date: "2026-09-23", slot: "09:00", status: "succeeded",
        createdAt: "2026-09-23T00:00:00Z", updatedAt: "2026-09-23T00:05:00Z",
        productId: "product-1", uploadJobId: "job-1", safeError: ""
      }]
    }));
    await writeFile(publisherPath, JSON.stringify({
      jobs: [{
        id: "job-1", productId: "product-1", channelKey: "neoman_moleulgeol",
        canonicalProductName: "fixture product", status: "ready", title: "fixture title",
        createdAt: "2026-09-23T00:05:00Z", publishedAt: "", youtubeUrl: "", youtubeVideoId: ""
      }], ledger: []
    }));
    const model = await readCommerceStudioModel(new Date("2026-09-23T00:00:00.000Z"));
    expect(model.producerSource).toBe("connected");
    expect(model.publisherSource).toBe("connected");
    expect(model.slots).toHaveLength(14);
    expect(model.calendarDates).toHaveLength(21);
    expect(model.producerObservedAt).toBe("2026-09-23T00:05:00Z");
    expect(model.queriedAt).toBe("2026-09-23T00:00:00.000Z");
    expect(model.slots.find((slot) => slot.date === "2026-09-23" && slot.time === "09:00")).toMatchObject({ status: "succeeded", productName: "fixture product", publishStatus: "ready" });
    expect(model.slots.find((slot) => slot.date === "2026-09-23" && slot.time === "15:00")).toMatchObject({ status: "scheduled", productName: null });
    expect(model.contents).toHaveLength(1);
  });

  it("shows known schedules but not invented execution when the producer state file is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-unobserved-"));
    roots.push(root);
    const configPath = join(root, "config.json");
    process.env.SIMPLE_PRODUCER_CONFIG_PATH = configPath;
    delete process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH;
    await writeFile(configPath, JSON.stringify({
      schema: "simple-producer/v1", enabled: true, dailyGenerateTarget: 1,
      maxItemsPerRun: 1, generationSlots: ["09:00"],
      timeZone: "Asia/Seoul", evidenceRoot: root
    }));
    const model = await readCommerceStudioModel(new Date("2026-09-23T04:00:00.000Z"));
    expect(model.producerSource).toBe("unavailable");
    expect(model.slots.find((slot) => slot.date === "2026-09-23" && slot.time === "09:00")?.status).toBe("unknown");
    expect(model.slots.find((slot) => slot.date === "2026-09-24" && slot.time === "09:00")?.status).toBe("scheduled");
  });

  it("keeps persisted historical slots after schedule change and rejects unsafe slot URLs", async () => {
    const root = await mkdtemp(join(tmpdir(), "studio-history-"));
    roots.push(root);
    const configPath = join(root, "config.json");
    const publisherPath = join(root, "publisher.json");
    process.env.SIMPLE_PRODUCER_CONFIG_PATH = configPath;
    process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH = publisherPath;
    await writeFile(configPath, JSON.stringify({ schema: "simple-producer/v1", enabled: true, dailyGenerateTarget: 1,
      maxItemsPerRun: 1, generationSlots: ["10:00"], timeZone: "Asia/Seoul", evidenceRoot: root }));
    await writeFile(join(root, "simple-producer-state.json"), JSON.stringify({ schema: "simple-producer/v1", slots: [{
      date: "2026-09-01", slot: "09:00", status: "succeeded", createdAt: "2026-09-01T00:00:00Z",
      updatedAt: "2026-09-01T00:05:00Z", productId: "old-product", uploadJobId: "old-job", safeError: ""
    }] }));
    await writeFile(publisherPath, JSON.stringify({ jobs: [{ id: "old-job", productId: "old-product", channelKey: "father_jobs",
      canonicalProductName: "과거 상품", status: "uploaded", title: "과거 제목", createdAt: "2026-09-01T00:05:00Z",
      publishedAt: "2026-09-02T00:05:00Z", youtubeUrl: "javascript:alert(1)", youtubeVideoId: "video-id" }], ledger: [] }));
    const model = await readCommerceStudioModel(new Date("2026-09-23T00:00:00.000Z"));
    expect(model.slots.find((slot) => slot.date === "2026-09-01" && slot.time === "09:00")).toMatchObject({ status: "succeeded", youtubeUrl: null });
    expect(model.slots.some((slot) => slot.date === "2026-09-01" && slot.time === "10:00")).toBe(false);
    expect(model.contents[0].youtubeUrl).toBeNull();
    expect(model.publisherObservedAt).toBe("2026-09-01T00:05:00Z");
  });
});
