import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  materializeAllocatedUsageEvidence,
  type AllocatedUsageEvidenceCandidate,
  type AllocatedUsageEvidenceDependencies,
} from "@/lib/queue-scheduler/allocatedUsageEvidence";
import type { UsageEvidenceAllocation, UsageEvidenceRegistry } from "@/lib/usage-evidence";
import { makeUsageEvidenceRegistry } from "../usage-evidence/fixture";

const roots: string[] = [];
const validProbe = {
  videoCodec: "h264",
  width: 1080,
  height: 1920,
  fps: 30,
  durationSeconds: 9,
  audioStreamCount: 0,
};

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("materializeAllocatedUsageEvidence", () => {
  it("materializes one immutable, sanitized, product-bound scene pack with argument-array ffmpeg", async () => {
    const fixture = await createFixture();
    const invocations: readonly string[][] = [];
    const runFfmpeg = vi.fn(async (args: readonly string[]) => {
      (invocations as string[][]).push([...args]);
      await writeFile(args[args.length - 1], "deterministic-h264-scene-pack");
    });
    const dependencies: AllocatedUsageEvidenceDependencies = {
      runFfmpeg,
      probeVideo: vi.fn(async () => validProbe),
    };

    const first = await materializeAllocatedUsageEvidence(fixture.input, dependencies);

    expect(first).toMatchObject({
      productKey: fixture.input.productKey,
      sourceType: "allocated_sanitized_local_scene_pack",
      identityType: "generic_usage_example",
      approvalStatus: "approved",
      ownerReviewStatus: "pass",
      reviewClass: "CODEX_REVIEWED_LOCAL_ONLY",
      noUploadAutomationEligible: true,
      publishEligible: false,
      SAFE_TO_UPLOAD: false,
      provenance: {
        packId: fixture.input.allocation.packId,
        useCase: fixture.input.allocation.useCase,
        assetIds: fixture.input.allocation.assetIds,
        sourceIds: fixture.input.allocation.sourceIds,
      },
    });
    expect(runFfmpeg).toHaveBeenCalledTimes(1);
    expect(invocations[0]).toEqual(expect.arrayContaining([
      "-filter_complex", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "1",
    ]));
    expect(invocations[0].filter((value) => value === "-i")).toHaveLength(3);
    expect(invocations[0].join(" ")).toContain("scale=1080:1920");
    expect(invocations[0].join(" ")).toContain("concat=n=3:v=1:a=0");

    const manifestText = await readFile(first.reviewEvidencePath, "utf8");
    const manifest = JSON.parse(manifestText) as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schemaVersion: "allocated-usage-evidence-v1",
      productKey: fixture.input.productKey,
      packId: fixture.input.allocation.packId,
      reviewClass: "CODEX_REVIEWED_LOCAL_ONLY",
      identityType: "generic_usage_example",
      ownerReviewStatus: "pass",
      noUploadAutomationEligible: true,
      publishEligible: false,
      SAFE_TO_UPLOAD: false,
      output: {
        videoCodec: "h264",
        width: 1080,
        height: 1920,
        fps: 30,
        durationSeconds: 9,
        audioStreamCount: 0,
      },
    });
    expect(manifestText).not.toContain(fixture.assetRoot);
    expect(manifestText).not.toContain("sourceRelativeReference");
    expect(manifestText).not.toContain("safeReviewNotes");
    expect(first.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.reviewEvidenceSha256).toMatch(/^[0-9a-f]{64}$/u);

    const second = await materializeAllocatedUsageEvidence(fixture.input, dependencies);
    expect(second).toEqual(first);
    expect(runFfmpeg).toHaveBeenCalledTimes(1);
    expect((await readdir(fixture.outputDir)).filter((name) => name.includes("staging"))).toEqual([]);
  });

  it("fails closed on product, pack, source-id, containment, and exact-SHA mismatches", async () => {
    const productMismatch = await createFixture();
    await expect(materializeAllocatedUsageEvidence({
      ...productMismatch.input,
      productKey: "different-product",
    }, fakeDependencies())).rejects.toThrow("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH");

    const packMismatch = await createFixture();
    await expect(materializeAllocatedUsageEvidence({
      ...packMismatch.input,
      allocation: { ...packMismatch.input.allocation, assetIds: [...packMismatch.input.allocation.assetIds].reverse() },
    }, fakeDependencies())).rejects.toThrow("ALLOCATED_USAGE_ALLOCATION_MISMATCH");

    const sourceMismatch = await createFixture();
    await expect(materializeAllocatedUsageEvidence({
      ...sourceMismatch.input,
      allocation: { ...sourceMismatch.input.allocation, sourceIds: ["wrong", ...sourceMismatch.input.allocation.sourceIds.slice(1)] },
    }, fakeDependencies())).rejects.toThrow("ALLOCATED_USAGE_ALLOCATION_MISMATCH");

    const escaped = await createFixture(({ registry, selected }) => {
      selected[0].sourceRelativeReference = "../outside.jpg";
      return registry;
    });
    await writeFile(join(escaped.root, "outside.jpg"), "asset-image-1");
    await expect(materializeAllocatedUsageEvidence(escaped.input, fakeDependencies())).rejects.toThrow("ALLOCATED_USAGE_ASSET_PATH_OUTSIDE_ROOT");

    const hashMismatch = await createFixture();
    await writeFile(join(hashMismatch.assetRoot, "selected", "image-2.jpg"), "mutated-after-registry");
    await expect(materializeAllocatedUsageEvidence(hashMismatch.input, fakeDependencies())).rejects.toThrow("ALLOCATED_USAGE_ASSET_HASH_MISMATCH");
  });

  it("rejects ineligible reviewed assets and any non-H264, wrong-size, or audio-bearing output", async () => {
    const blocked = await createFixture(({ registry, selected }) => {
      selected[1].derivedCodexVisualReviewStatus = "fail";
      return registry;
    });
    await expect(materializeAllocatedUsageEvidence(blocked.input, fakeDependencies())).rejects.toThrow("USAGE_SOURCE_REVIEW_NOT_VALID");

    for (const invalidProbe of [
      { ...validProbe, videoCodec: "vp9" },
      { ...validProbe, width: 720 },
      { ...validProbe, audioStreamCount: 1 },
    ]) {
      const fixture = await createFixture();
      await expect(materializeAllocatedUsageEvidence(fixture.input, fakeDependencies(invalidProbe)))
        .rejects.toThrow("ALLOCATED_USAGE_MEDIA_PROFILE_INVALID");
      expect(await readdir(fixture.outputDir)).toEqual([]);
    }
  });

  const realOperationRoot = join(process.cwd(), "data", "daily69-first-operation", "operation-2026-08-18");
  const realAssetRoot = process.env.DAILY69_REAL_ASSET_ROOT?.trim() || "D:/MyProjects/commerce-automation";
  const realInputsAvailable = existsSync(join(realOperationRoot, "selected-registry.json"))
    && existsSync(join(realOperationRoot, "queue.json"))
    && existsSync(join(realAssetRoot, "commerce-assets", "review", "v112", "father_jobs", "generated-scenes", "02-v112-before-messy.png"));

  it.runIf(realInputsAvailable)("validates the exact real slot 001/002/003/007 allocation subsets and local hashes without real ffmpeg", async () => {
    const root = await mkdtemp(join(tmpdir(), "allocated-usage-real-selection-"));
    roots.push(root);
    const queue = JSON.parse(await readFile(join(realOperationRoot, "queue.json"), "utf8")) as Array<{
      id: string;
      productKey: string;
      candidate: AllocatedUsageEvidenceCandidate;
      usageEvidenceAllocation: UsageEvidenceAllocation;
    }>;
    const runFfmpeg = vi.fn(async (args: readonly string[]) => writeFile(args[args.length - 1], "real-selection-fake-video"));
    const selectedSlots = [1, 2, 3, 7];
    for (const slot of selectedSlots) {
      const marker = `-${String(slot).padStart(3, "0")}-`;
      const item = queue.find(({ id }) => id.includes(marker));
      expect(item, `missing real queue slot ${slot}`).toBeDefined();
      const result = await materializeAllocatedUsageEvidence({
        candidate: item!.candidate,
        productKey: item!.productKey,
        allocation: item!.usageEvidenceAllocation,
        selectedRegistryPath: join(realOperationRoot, "selected-registry.json"),
        assetRoot: realAssetRoot,
        outputDir: join(root, `slot-${String(slot).padStart(3, "0")}`),
      }, { runFfmpeg, probeVideo: async () => validProbe });
      expect(result.provenance.assetIds).toEqual(item!.usageEvidenceAllocation.assetIds);
      expect(result.provenance.sequenceFingerprint).toBe(item!.usageEvidenceAllocation.sequenceFingerprint);
    }
    expect(runFfmpeg).toHaveBeenCalledTimes(4);
  });
});

async function createFixture(
  mutate?: (input: { registry: UsageEvidenceRegistry; selected: UsageEvidenceRegistry["assets"] }) => UsageEvidenceRegistry,
) {
  const root = await mkdtemp(join(tmpdir(), "allocated-usage-evidence-"));
  roots.push(root);
  const assetRoot = join(root, "asset-root");
  const outputDir = join(root, "output");
  await mkdir(join(assetRoot, "selected"), { recursive: true });

  const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
  const deskPacks = registry.packs.filter(({ useCase }) => useCase === "desk_organization");
  const pack = deskPacks[0];
  const allocatedAssetIds = [...pack.assetIds];
  pack.assetIds = deskPacks.flatMap(({ assetIds }) => assetIds);
  pack.problemAssetIds = deskPacks.flatMap(({ problemAssetIds }) => problemAssetIds);
  pack.usageAssetIds = deskPacks.flatMap(({ usageAssetIds }) => usageAssetIds);
  pack.actionAssetIds = deskPacks.flatMap(({ actionAssetIds }) => actionAssetIds);
  pack.afterAssetIds = deskPacks.flatMap(({ afterAssetIds }) => afterAssetIds);
  const selected = allocatedAssetIds.map((assetId) => registry.assets.find((asset) => asset.assetId === assetId)!);
  for (const [index, asset] of selected.entries()) {
    const content = `asset-image-${index + 1}`;
    const sourceRelativeReference = `selected/image-${index + 1}.jpg`;
    await writeFile(join(assetRoot, sourceRelativeReference), content);
    asset.sourceRelativeReference = sourceRelativeReference;
    asset.derivedSha256 = sha256(content);
  }
  const finalRegistry = mutate?.({ registry, selected }) ?? registry;
  const selectedRegistryPath = join(root, "selected-registry.json");
  await writeFile(selectedRegistryPath, `${JSON.stringify(finalRegistry, null, 2)}\n`);
  const allocation: UsageEvidenceAllocation = {
    productKey: "product-exact-1",
    useCase: pack.useCase,
    packId: pack.packId,
    assetIds: [...allocatedAssetIds],
    sequenceFingerprint: `${pack.sequenceFingerprint}:${allocatedAssetIds.join(":")}`,
    sourceIds: selected.map(({ sourceId }) => sourceId),
  };
  return {
    root,
    assetRoot,
    outputDir,
    input: {
      candidate: { productKey: allocation.productKey, useCase: "desk_organization" as const },
      productKey: allocation.productKey,
      allocation,
      selectedRegistryPath,
      assetRoot,
      outputDir,
    },
  };
}

function fakeDependencies(probe = validProbe): AllocatedUsageEvidenceDependencies {
  return {
    runFfmpeg: async (args) => writeFile(args[args.length - 1], "fake-video"),
    probeVideo: async () => probe,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
