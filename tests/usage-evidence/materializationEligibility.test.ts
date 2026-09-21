import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allocateUsageEvidence,
  assessUsageAllocationProductionMaterializability,
  createUsageAllocationState,
  preflightDaily69MaterializationEligibility,
  validateGeneratedUsageSourceReviewManifest,
  validateUsageEvidenceRegistry,
} from "@/lib/usage-evidence";
import { makeRankedProducts, makeUsageEvidenceRegistry } from "./fixture";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));

describe("production usage materialization eligibility", () => {
  it("requires an exact successful review receipt before generated sources can be registered", () => {
    const manifest = {
      schemaVersion: "daily69-generated-source-review-v1",
      reviewedAt: "2026-08-29T12:19:00.000Z",
      visualReviewExecuted: true,
      reviewerExecution: "codex_current_task_visual_inspection",
      machineQaTool: "tools/video-automation/visual_qa.py:validate_image",
      machineQaExternalApiCalled: false,
      uploadAttempted: false,
      items: [{ sourceRelativeReference: "review/example.png", sha256: "1".repeat(64), machineQaStatus: "pass", codexVisualReviewStatus: "pass", identityType: "generic_usage_example", width: 941, height: 1672, blockCodes: [] }],
    };
    expect(validateGeneratedUsageSourceReviewManifest(manifest)).toBe(manifest);
    expect(() => validateGeneratedUsageSourceReviewManifest({ ...manifest, visualReviewExecuted: false })).toThrow("GENERATED_USAGE_SOURCE_REVIEW_INVALID");
    expect(() => validateGeneratedUsageSourceReviewManifest({ ...manifest, items: [{ ...manifest.items[0], blockCodes: ["GENERATED_TEXT_OR_WATERMARK_DETECTED"] }] })).toThrow("GENERATED_USAGE_SOURCE_REVIEW_INVALID");
  });

  it("does not confuse generic registry eligibility with production materializability", () => {
    const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2, sourceKind: "derived_frame_pack" });
    const candidate = makeRankedProducts(20).find((entry) => entry.candidate.useCase === registry.packs[0].useCase)!;
    expect(validateUsageEvidenceRegistry(registry)).toBe(registry);
    expect(allocateUsageEvidence({ candidate, registry, state: createUsageAllocationState() }))
      .toMatchObject({ allocation: null, reason: "assetCapacityRejected" });
  });

  it("passes only when both active and reserve allocations have concrete exact-SHA images", async () => {
    const fixture = await materializableFixture();
    const report = await preflightDaily69MaterializationEligibility({
      active: [fixture.active], reserve: [fixture.reserve], registry: fixture.registry, assetRoot: fixture.root,
      requiredActive: 1, requiredReserve: 1,
    });
    expect(report).toMatchObject({ activeTotal: 1, activeMaterializable: 1, activeBlocked: 0, reserveTotal: 1, reserveMaterializable: 1, reserveBlocked: 0, pass: true, safeCode: "" });
  });

  it.each(["allocation", "candidate"] as const)("rejects a %s product binding that the materializer would reject", async (binding) => {
    const fixture = await materializableFixture();
    if (binding === "allocation") fixture.active.usageEvidenceAllocation.productKey = "different-product";
    else fixture.active.candidate.productKey = "different-product";
    const report = await preflightDaily69MaterializationEligibility({
      active: [fixture.active], reserve: [], registry: fixture.registry, assetRoot: fixture.root,
      requiredActive: 1, requiredReserve: 0,
    });
    expect(report).toMatchObject({ pass: false, activeBlocked: 1, safeReasonCodes: ["ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH"] });
  });

  it("rejects a marker-only image even when its exact SHA matches the registry", async () => {
    const fixture = await materializableFixture();
    const allocation = fixture.active.usageEvidenceAllocation;
    const asset = fixture.registry.assets.find(({ assetId }) => assetId === allocation.assetIds[0])!;
    const spoof = Buffer.from([0xff, 0xd8, 0x41, 0x42, 0xff, 0xd9]);
    asset.sourceRelativeReference = "sanitized/spoof.jpg";
    asset.sourceSha256 = sha256(spoof);
    asset.derivedSha256 = sha256(spoof);
    await writeFile(join(fixture.root, asset.sourceRelativeReference), spoof);
    const report = await preflightDaily69MaterializationEligibility({ active: [fixture.active], reserve: [], registry: fixture.registry, assetRoot: fixture.root, requiredActive: 1, requiredReserve: 0 });
    expect(report).toMatchObject({ pass: false, activeBlocked: 1, safeReasonCodes: ["ALLOCATED_USAGE_ASSET_MEDIA_TYPE_INVALID"] });
  });

  it.each(["active", "reserve"] as const)("fails the whole preflight for one incompatible %s allocation", async (blockedSide) => {
    const fixture = await materializableFixture();
    const registry = structuredClone(fixture.registry);
    const blockedAllocation = blockedSide === "active" ? fixture.active.usageEvidenceAllocation : fixture.reserve.usageEvidenceAllocation;
    const asset = registry.assets.find(({ assetId }) => assetId === blockedAllocation.assetIds[0])!;
    asset.sourceKind = "derived_frame_pack";
    asset.derivationOperation = "ffmpeg_scene_detected_segment_midpoint";
    asset.clipStartSeconds = 0;
    asset.clipEndSeconds = 0;
    expect(validateUsageEvidenceRegistry(registry)).toBe(registry);
    expect(assessUsageAllocationProductionMaterializability({ registry, allocation: blockedAllocation, productKey: blockedAllocation.productKey, useCase: blockedAllocation.useCase }))
      .toMatchObject({ materializable: false, safeCode: "ALLOCATED_USAGE_ASSET_NOT_ELIGIBLE" });
    const report = await preflightDaily69MaterializationEligibility({
      active: [fixture.active], reserve: [fixture.reserve], registry, assetRoot: fixture.root, requiredActive: 1, requiredReserve: 1,
    });
    expect(report).toMatchObject({ pass: false, safeCode: "MATERIALIZABLE_CAPACITY_SHORTFALL" });
    expect(blockedSide === "active" ? report.activeBlocked : report.reserveBlocked).toBe(1);
  });

  it("rejects a materializable reserve allocation whose affiliate destination is not operational", async () => {
    const fixture = await materializableFixture();
    fixture.reserve.candidate.selectedAffiliateUrl = "";
    const report = await preflightDaily69MaterializationEligibility({
      active: [fixture.active], reserve: [fixture.reserve], registry: fixture.registry, assetRoot: fixture.root,
      requiredActive: 1, requiredReserve: 1,
    });
    expect(report).toMatchObject({
      pass: false,
      activeMaterializable: 1,
      reserveMaterializable: 0,
      reserveBlocked: 1,
      safeReasonCodes: ["AFFILIATE_NOT_READY"],
    });
  });
});

async function materializableFixture() {
  const root = await mkdtemp(join(tmpdir(), "daily69-materialization-"));
  roots.push(root);
  const registry = makeUsageEvidenceRegistry({ packsPerUseCase: 2 });
  for (const asset of registry.assets) {
    const bytes = png();
    asset.sourceRelativeReference = asset.sourceRelativeReference.replace(/\.jpg$/u, ".png");
    const path = join(root, asset.sourceRelativeReference);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    asset.sourceSha256 = sha256(bytes);
    asset.derivedSha256 = sha256(bytes);
  }
  const ranked = makeRankedProducts(30).filter(({ candidate }) => candidate.useCase === registry.packs[0].useCase);
  ranked.forEach(({ candidate }, index) => { candidate.selectedAffiliateUrl = `https://link.coupang.com/a/materialization-${index}`; });
  const state = createUsageAllocationState();
  const activeAllocation = allocateUsageEvidence({ candidate: ranked[0], registry, state }).allocation!;
  const reserveAllocation = allocateUsageEvidence({ candidate: ranked[1], registry, state }).allocation!;
  return {
    root,
    registry,
    active: { id: "active-001", productKey: activeAllocation.productKey, candidate: ranked[0].candidate, usageEvidenceAllocation: activeAllocation },
    reserve: { candidate: ranked[1].candidate, usageEvidenceAllocation: reserveAllocation },
  };
}

function png() { return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZlOkAAAAASUVORK5CYII=", "base64"); }
function sha256(value: Buffer) { return createHash("sha256").update(value).digest("hex"); }
