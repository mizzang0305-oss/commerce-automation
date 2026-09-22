import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InMemoryStudioBridge } from "@/lib/commerce-studio/bridge/memoryStore";
import { applyStudioHostCommand, type StudioSettingsAdapter } from "@/lib/commerce-studio/plans/apply";
import { runSimpleProducerOnce } from "@/lib/simple-producer/producer";
import { InMemorySimpleProducerStore } from "@/lib/simple-producer/state";
import { InMemoryYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/publisher";
import type { StudioCommand, StudioSettings } from "@/lib/commerce-studio/bridge/contracts";

const host = { ownerId: "owner", hostId: "isolated-host", environmentId: "isolated" };
const slotId = "2026-09-24|09:00";
const productB = "coupang:product:123:item:456:vendor:789";
const productC = "coupang:product:999:item:888:vendor:777";
const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

const select = (productId = productB, expectedVersion = 0): StudioCommand => ({
  commandId: randomUUID(), ...host, type: "SELECT_PRODUCT", targetId: slotId, expectedVersion,
  requestedAt: "2026-09-23T00:00:00.000Z", expiresAt: "2026-09-24T00:00:00.000Z",
  payload: { candidateSnapshotId: "snapshot-B", productId }
});

describe("Commerce Studio isolated owner → host → producer flow", () => {
  it("selects exact B, retains pending until ACK and passes exact B into producer input", async () => {
    const bridge = new InMemoryStudioBridge(host);
    const store = new InMemorySimpleProducerStore({ schema: "simple-producer/v1", slots: [], studioCandidates: [
      { snapshotId: "snapshot-B", slotId, sourceRevision: "fixture-1", productId: productB, productName: "격리 상품 B", channelKey: "neoman_moleulgeol", eligible: true, eligibilityCheckedAt: "2026-09-23T00:00:00.000Z", safeBlockers: [] }
    ] });
    const command = select();
    expect((await bridge.enqueue(command, host.ownerId)).status).toBe("pending");
    const receipt = await applyStudioHostCommand({ command, producerStore: store, ...host, now: new Date("2026-09-23T01:00:00.000Z") });
    expect(receipt).toMatchObject({ status: "applied", appliedVersion: 1 });
    expect(bridge.command(host.ownerId, command.commandId)?.status).toBe("pending");
    expect(await applyStudioHostCommand({ command, producerStore: store, ...host, now: new Date("2026-09-23T01:01:00.000Z") })).toEqual(receipt);
    await bridge.acknowledge(host.hostId, command.commandId, { status: "applied", receipt: "fixture-ack-B", appliedRevision: 1 });

    const root = await mkdtemp(join(tmpdir(), "studio-plan-")); roots.push(root);
    const videoPath = join(root, "video.mp4"); await writeFile(videoPath, "isolated-video");
    const publisherStore = new InMemoryYouTubePublicPublisherStore({ jobs: [], ledger: [] });
    let executedId: string | null | undefined;
    const result = await runSimpleProducerOnce({
      config: { schema: "simple-producer/v1", enabled: true, dailyGenerateTarget: 3, maxItemsPerRun: 1, generationSlots: ["09:00", "15:00", "21:00"], timeZone: "Asia/Seoul", evidenceRoot: root },
      producerStore: store, publisherStore, now: new Date("2026-09-24T00:00:00.000Z"),
      executePipeline: async (input) => {
        executedId = input.lockedProductId;
        return { ok: true, safeError: "", searchCalls: 0, rawProductsFound: 1, eligibleProductsFound: 1,
          item: { productId: productB, canonicalProductName: "격리 상품 B", affiliateUrl: "https://link.coupang.com/a/fixture", useCase: "laundry_drying", videoPath, machineQaPassed: true } };
      }
    });
    expect(executedId).toBe(productB);
    expect(result).toMatchObject({ status: "ready_job_created", productId: productB, videosInsertCalls: 0 });
    expect((await store.read()).studioPlans?.[0]).toMatchObject({ status: "completed", exactProductId: productB });
    expect((await publisherStore.read()).jobs[0]).toMatchObject({ productId: productB, status: "ready" });
  });

  it("fails closed on stale version, ineligible candidate, post-claim edit and wrong pipeline product", async () => {
    const store = new InMemorySimpleProducerStore({ schema: "simple-producer/v1", slots: [], studioCandidates: [
      { snapshotId: "snapshot-B", slotId, sourceRevision: "fixture-1", productId: productB, productName: "B", channelKey: "father_jobs", eligible: true, eligibilityCheckedAt: "2026-09-23T00:00:00.000Z", safeBlockers: [] }
    ] });
    const now = new Date("2026-09-23T01:00:00.000Z");
    expect((await applyStudioHostCommand({ command: select(productC), producerStore: store, ...host, now })).safeError).toBe("STUDIO_CANDIDATE_NOT_ELIGIBLE");
    const chosen = select();
    expect((await applyStudioHostCommand({ command: chosen, producerStore: store, ...host, now })).status).toBe("applied");
    expect((await applyStudioHostCommand({ command: select(productB, 0), producerStore: store, ...host, now })).safeError).toBe("STUDIO_PLAN_VERSION_STALE");
    const root = await mkdtemp(join(tmpdir(), "studio-plan-")); roots.push(root);
    const publisherStore = new InMemoryYouTubePublicPublisherStore({ jobs: [], ledger: [] });
    const result = await runSimpleProducerOnce({
      config: { schema: "simple-producer/v1", enabled: true, dailyGenerateTarget: 3, maxItemsPerRun: 1, generationSlots: ["09:00"], timeZone: "Asia/Seoul", evidenceRoot: root },
      producerStore: store, publisherStore, now: new Date("2026-09-24T00:00:00.000Z"),
      executePipeline: async () => ({ ok: true, safeError: "", searchCalls: 0, rawProductsFound: 1, eligibleProductsFound: 1,
        item: { productId: productC, canonicalProductName: "C", affiliateUrl: "https://link.coupang.com/a/fixture", useCase: "vehicle_organization", videoPath: "missing", machineQaPassed: true } })
    });
    expect(result).toMatchObject({ status: "failed", safeError: "SIMPLE_PRODUCER_LOCKED_PRODUCT_MISMATCH", videosInsertCalls: 0 });
    expect((await publisherStore.read()).jobs).toHaveLength(0);
    const afterClaim = { ...select(productB, 1), expiresAt: "2026-09-24T02:00:00.000Z" };
    expect((await applyStudioHostCommand({ command: afterClaim, producerStore: store, ...host, now: new Date("2026-09-24T01:00:00.000Z") })).safeError).toBe("STUDIO_PLAN_ALREADY_CLAIMED");
  });

  it("does not mark settings applied until both config and Task readback match", async () => {
    const store = new InMemorySimpleProducerStore();
    const initial: StudioSettings = { enabled: true, dailyGenerateTarget: 3, maxItemsPerRun: 1, generationSlots: ["09:00", "15:00", "21:00"], timeZone: "Asia/Seoul", revision: 0 };
    let config = initial;
    let taskSlots = [...initial.generationSlots];
    let failTask = true;
    let configWrites = 0;
    const adapter: StudioSettingsAdapter = {
      read: async () => structuredClone(config),
      write: async (next) => { configWrites += 1; config = structuredClone(next); },
      readTaskSlots: async () => [...taskSlots],
      writeTaskSlots: async (slots) => { if (failTask) throw new Error("fixture task unavailable"); taskSlots = [...slots]; }
    };
    const command: StudioCommand = { commandId: randomUUID(), ...host, type: "SET_PRODUCER_SETTINGS", targetId: "simple-producer", expectedVersion: 0,
      requestedAt: "2026-09-23T00:00:00.000Z", expiresAt: "2026-09-24T00:00:00.000Z",
      payload: { enabled: true, dailyGenerateTarget: 2, maxItemsPerRun: 1, generationSlots: ["10:00", "15:00"], timeZone: "Asia/Seoul" } };
    const context = { command, producerStore: store, settingsAdapter: adapter, ...host, now: new Date("2026-09-23T01:00:00.000Z") };
    expect((await applyStudioHostCommand(context)).status).toBe("pending");
    expect(config.revision).toBe(1);
    expect(configWrites).toBe(1);
    failTask = false;
    expect(await applyStudioHostCommand(context)).toMatchObject({ status: "applied", appliedVersion: 1 });
    expect(configWrites).toBe(1);
    expect(taskSlots).toEqual(["10:00", "15:00"]);
  });
});
