import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { LiveProductCandidate } from "@/lib/live-product-video/types";
import type {
  UsageEvidenceAllocation,
  UsageEvidenceAsset,
  UsageEvidencePack,
  UsageEvidenceRegistry,
} from "@/lib/usage-evidence/contracts";
import { isEligibleAsset, isEligiblePack, validateUsageEvidenceRegistry } from "@/lib/usage-evidence/registry";
import { sha256File } from "./mediaEvidence";

const execFileAsync = promisify(execFile);
const MANIFEST_SCHEMA_VERSION = "allocated-usage-evidence-v1" as const;
const PROVENANCE_SCHEMA_VERSION = "allocated-usage-evidence-provenance-v1" as const;
const RENDERER_SPEC = Object.freeze({
  name: "allocated-sanitized-image-scene-pack-v1",
  imageCount: 3,
  secondsPerImage: 3,
  durationSeconds: 9,
  videoCodec: "h264",
  encoder: "libx264",
  width: 1080,
  height: 1920,
  fps: 30,
  pixelFormat: "yuv420p",
  audioStreamCount: 0,
});

export type AllocatedUsageEvidenceCandidate = Pick<LiveProductCandidate, "productKey" | "useCase">;

export type AllocatedUsageVideoProbe = {
  videoCodec: string;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  audioStreamCount: number;
};

export type AllocatedUsageReviewClass =
  | "CODEX_REVIEWED_LOCAL_ONLY"
  | "HUMAN_AND_CODEX_REVIEWED_LOCAL_ONLY";

export type AllocatedGenericUsageEvidence = {
  assetId: string;
  productKey: string;
  sourcePath: string;
  sourceSha256: string;
  reviewEvidencePath: string;
  reviewEvidenceSha256: string;
  sourceType: "allocated_sanitized_local_scene_pack";
  identityType: "generic_usage_example";
  usageType: "real_use_context";
  approvalStatus: "approved";
  ownerReviewStatus: "pass";
  reviewClass: AllocatedUsageReviewClass;
  noUploadAutomationEligible: true;
  publishEligible: false;
  SAFE_TO_UPLOAD: false;
  provenance: {
    schemaVersion: typeof PROVENANCE_SCHEMA_VERSION;
    registrySha256: string;
    allocationSha256: string;
    rendererSpecSha256: string;
    packId: string;
    useCase: string;
    sequenceFingerprint: string;
    assetIds: string[];
    sourceIds: string[];
    sourceImageSha256s: string[];
    outputSha256: string;
  };
};

export type AllocatedUsageEvidenceDependencies = {
  runFfmpeg?: (args: readonly string[]) => Promise<void>;
  probeVideo?: (path: string) => Promise<AllocatedUsageVideoProbe>;
};

type SelectedAsset = {
  asset: UsageEvidenceAsset;
  sourcePath: string;
  sha256: string;
};

type SanitizedManifest = {
  schemaVersion: typeof MANIFEST_SCHEMA_VERSION;
  materializationId: string;
  productKey: string;
  useCase: string;
  packId: string;
  sequenceFingerprint: string;
  registrySha256: string;
  allocationSha256: string;
  rendererSpecSha256: string;
  reviewClass: AllocatedUsageReviewClass;
  identityType: "generic_usage_example";
  ownerReviewStatus: "pass";
  noUploadAutomationEligible: true;
  publishEligible: false;
  SAFE_TO_UPLOAD: false;
  assets: Array<{
    assetId: string;
    sourceId: string;
    sourceSha256: string;
    localImageSha256: string;
    sceneRoles: UsageEvidenceAsset["sceneRoles"];
    reviewClass: AllocatedUsageReviewClass;
  }>;
  output: {
    fileName: string;
    sha256: string;
    sizeBytes: number;
    videoCodec: "h264";
    width: 1080;
    height: 1920;
    fps: 30;
    durationSeconds: 9;
    audioStreamCount: 0;
  };
};

export async function materializeAllocatedUsageEvidence(input: {
  candidate: AllocatedUsageEvidenceCandidate;
  productKey: string;
  allocation: UsageEvidenceAllocation;
  selectedRegistryPath: string;
  assetRoot: string;
  outputDir: string;
}, dependencies: AllocatedUsageEvidenceDependencies = {}): Promise<AllocatedGenericUsageEvidence> {
  validateIdentifier(input.productKey, "ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH");
  if (input.candidate.productKey !== input.productKey || input.allocation.productKey !== input.productKey) {
    fail("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH");
  }
  if (input.candidate.useCase === "unsupported" || input.allocation.useCase !== input.candidate.useCase) {
    fail("ALLOCATED_USAGE_USE_CASE_MISMATCH");
  }

  const { registry, registrySha256 } = await readValidatedRegistry(input.selectedRegistryPath);
  const pack = selectExactPack(registry, input.allocation, input.productKey, input.candidate.useCase);
  const assets = selectExactAssets(registry, pack, input.allocation, input.productKey);
  const selected = await resolveAndVerifyAssets(assets, input.assetRoot);
  const reviewClass = classifyReview(selected.map(({ asset }) => asset));
  const rendererSpecSha256 = sha256Text(stableJson(RENDERER_SPEC));
  const allocationSha256 = sha256Text(stableJson({
    productKey: input.productKey,
    useCase: input.allocation.useCase,
    packId: input.allocation.packId,
    assetIds: input.allocation.assetIds,
    sequenceFingerprint: input.allocation.sequenceFingerprint,
    sourceIds: input.allocation.sourceIds,
  }));
  const materializationId = sha256Text(stableJson({
    registrySha256,
    allocationSha256,
    rendererSpecSha256,
    imageSha256s: selected.map(({ sha256 }) => sha256),
  })).slice(0, 24);
  const fileStem = `allocated-usage-${materializationId}`;
  const outputDir = resolve(input.outputDir);
  const videoPath = join(outputDir, `${fileStem}.mp4`);
  const manifestPath = join(outputDir, `${fileStem}.manifest.json`);

  try {
    await mkdir(outputDir, { recursive: true });
  } catch {
    fail("ALLOCATED_USAGE_OUTPUT_NOT_AVAILABLE");
  }

  const existingVideo = await pathExists(videoPath);
  const existingManifest = await pathExists(manifestPath);
  if (existingVideo !== existingManifest) fail("ALLOCATED_USAGE_OUTPUT_CONFLICT");
  if (existingVideo && existingManifest) {
    return validateExistingMaterialization({
      input,
      selected,
      reviewClass,
      registrySha256,
      allocationSha256,
      rendererSpecSha256,
      materializationId,
      videoPath,
      manifestPath,
      dependencies,
    });
  }

  const stagingDir = await createStagingDirectory(outputDir);
  let copiedFinalVideo = false;
  try {
    const stagedInputs: string[] = [];
    for (const [index, item] of selected.entries()) {
      const extension = safeImageExtension(item.sourcePath);
      const stagedPath = join(stagingDir, `input-${index + 1}${extension}`);
      await copyFile(item.sourcePath, stagedPath, constants.COPYFILE_EXCL);
      if (await sha256File(stagedPath) !== item.sha256) fail("ALLOCATED_USAGE_ASSET_HASH_MISMATCH");
      stagedInputs.push(stagedPath);
    }

    const stagedVideoPath = join(stagingDir, "rendered.mp4");
    const ffmpegArgs = buildFfmpegArgs(stagedInputs, stagedVideoPath);
    try {
      await (dependencies.runFfmpeg ?? runFfmpeg)(ffmpegArgs);
    } catch (error) {
      if (isKnownFailure(error)) throw error;
      fail("ALLOCATED_USAGE_FFMPEG_FAILED");
    }
    const media = await inspectRenderedVideo(stagedVideoPath, dependencies.probeVideo);
    const videoSha256 = await sha256File(stagedVideoPath).catch(() => fail("ALLOCATED_USAGE_MEDIA_PROFILE_INVALID"));
    const sizeBytes = await stat(stagedVideoPath).then((value) => value.size).catch(() => 0);
    if (sizeBytes <= 0 || !isSha256(videoSha256)) fail("ALLOCATED_USAGE_MEDIA_PROFILE_INVALID");

    const manifest = buildManifest({
      input,
      selected,
      reviewClass,
      registrySha256,
      allocationSha256,
      rendererSpecSha256,
      materializationId,
      videoFileName: `${fileStem}.mp4`,
      videoSha256,
      sizeBytes,
      media,
    });
    try {
      await copyFile(stagedVideoPath, videoPath, constants.COPYFILE_EXCL);
      copiedFinalVideo = true;
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    } catch {
      if (copiedFinalVideo) await unlink(videoPath).catch(() => undefined);
      fail("ALLOCATED_USAGE_OUTPUT_CONFLICT");
    }
    return toApprovedEvidence(input.productKey, materializationId, videoPath, manifestPath, manifest, await sha256File(manifestPath));
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

async function readValidatedRegistry(path: string): Promise<{ registry: UsageEvidenceRegistry; registrySha256: string }> {
  let bytes: Buffer;
  try {
    bytes = await readFile(resolve(path));
  } catch {
    fail("USAGE_EVIDENCE_REGISTRY_NOT_READY");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("USAGE_EVIDENCE_REGISTRY_NOT_READY");
  }
  return {
    registry: validateUsageEvidenceRegistry(parsed),
    registrySha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function selectExactPack(
  registry: UsageEvidenceRegistry,
  allocation: UsageEvidenceAllocation,
  productKey: string,
  useCase: string,
): UsageEvidencePack {
  const matches = registry.packs.filter(({ packId }) => packId === allocation.packId);
  if (matches.length !== 1) fail("ALLOCATED_USAGE_PACK_NOT_FOUND");
  const pack = matches[0];
  if (pack.useCase !== useCase || allocation.useCase !== useCase) fail("ALLOCATED_USAGE_USE_CASE_MISMATCH");
  if (pack.boundProductKey && pack.boundProductKey !== productKey) fail("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH");
  if (
    allocation.assetIds.length !== RENDERER_SPEC.imageCount
    || new Set(allocation.assetIds).size !== RENDERER_SPEC.imageCount
    || !allocation.assetIds.every((assetId) => pack.assetIds.includes(assetId))
    || !pack.problemAssetIds.includes(allocation.assetIds[0])
    || ![...pack.usageAssetIds, ...pack.actionAssetIds].includes(allocation.assetIds[1])
    || !pack.afterAssetIds.includes(allocation.assetIds[2])
    || allocation.sequenceFingerprint !== `${pack.sequenceFingerprint}:${allocation.assetIds.join(":")}`
  ) {
    fail("ALLOCATED_USAGE_ALLOCATION_MISMATCH");
  }
  return pack;
}

function selectExactAssets(
  registry: UsageEvidenceRegistry,
  pack: UsageEvidencePack,
  allocation: UsageEvidenceAllocation,
  productKey: string,
): UsageEvidenceAsset[] {
  const assetsById = new Map<string, UsageEvidenceAsset>();
  for (const asset of registry.assets) {
    if (assetsById.has(asset.assetId)) fail("ALLOCATED_USAGE_ALLOCATION_MISMATCH");
    assetsById.set(asset.assetId, asset);
  }
  const selected = allocation.assetIds.map((assetId) => assetsById.get(assetId));
  if (selected.some((asset) => !asset)) fail("ALLOCATED_USAGE_ALLOCATION_MISMATCH");
  const exact = selected as UsageEvidenceAsset[];
  if (!sameStrings(allocation.sourceIds, [...new Set(exact.map(({ sourceId }) => sourceId))])) {
    fail("ALLOCATED_USAGE_ALLOCATION_MISMATCH");
  }
  const eligibleAssets = registry.assets.filter(isEligibleAsset);
  const eligibleIds = new Set(eligibleAssets.map(({ assetId }) => assetId));
  const allAssets = new Map(eligibleAssets.map((asset) => [asset.assetId, asset]));
  if (!isEligiblePack(pack, eligibleIds, allAssets)) fail("ALLOCATED_USAGE_PACK_NOT_ELIGIBLE");
  for (const asset of exact) {
    validateIdentifier(asset.assetId, "ALLOCATED_USAGE_ASSET_NOT_ELIGIBLE");
    validateIdentifier(asset.sourceId, "ALLOCATED_USAGE_ASSET_NOT_ELIGIBLE");
    if (
      !isEligibleAsset(asset)
      || asset.sourceKind !== "sanitized_local_image"
      || asset.identityType !== "generic_usage_example"
      || asset.derivedMachineQaStatus !== "pass"
      || asset.derivedCodexVisualReviewStatus !== "pass"
      || !asset.noUploadAutomationEligible
      || asset.publishEligible !== false
      || asset.blockCodes.length !== 0
      || !asset.useCases.includes(allocation.useCase)
    ) {
      fail("ALLOCATED_USAGE_ASSET_NOT_ELIGIBLE");
    }
    if (asset.boundProductKey && asset.boundProductKey !== productKey) {
      fail("ALLOCATED_USAGE_PRODUCT_BINDING_MISMATCH");
    }
  }
  return exact;
}

async function resolveAndVerifyAssets(assets: UsageEvidenceAsset[], assetRoot: string): Promise<SelectedAsset[]> {
  let approvedRoot: string;
  try {
    approvedRoot = await realpath(resolve(assetRoot));
    if (!(await stat(approvedRoot)).isDirectory()) fail("ALLOCATED_USAGE_ASSET_ROOT_NOT_AVAILABLE");
  } catch (error) {
    if (isKnownFailure(error)) throw error;
    fail("ALLOCATED_USAGE_ASSET_ROOT_NOT_AVAILABLE");
  }
  const selected: SelectedAsset[] = [];
  for (const asset of assets) {
    if (!asset.sourceRelativeReference || isAbsolute(asset.sourceRelativeReference)) {
      fail("ALLOCATED_USAGE_ASSET_PATH_OUTSIDE_ROOT");
    }
    const lexicalPath = resolve(approvedRoot, asset.sourceRelativeReference);
    assertContained(approvedRoot, lexicalPath);
    let sourcePath: string;
    try {
      sourcePath = await realpath(lexicalPath);
      assertContained(approvedRoot, sourcePath);
      if (!(await stat(sourcePath)).isFile()) fail("ALLOCATED_USAGE_ASSET_NOT_AVAILABLE");
    } catch (error) {
      if (isKnownFailure(error)) throw error;
      fail("ALLOCATED_USAGE_ASSET_NOT_AVAILABLE");
    }
    const sha256 = await sha256File(sourcePath).catch(() => fail("ALLOCATED_USAGE_ASSET_NOT_AVAILABLE"));
    if (!isSha256(asset.derivedSha256) || sha256 !== asset.derivedSha256) {
      fail("ALLOCATED_USAGE_ASSET_HASH_MISMATCH");
    }
    selected.push({ asset, sourcePath, sha256 });
  }
  return selected;
}

function assertContained(root: string, target: string): void {
  const fromRoot = relative(root, target);
  if (fromRoot === "" || (!fromRoot.startsWith("..\\") && fromRoot !== ".." && !fromRoot.startsWith("../") && !isAbsolute(fromRoot))) return;
  fail("ALLOCATED_USAGE_ASSET_PATH_OUTSIDE_ROOT");
}

function buildFfmpegArgs(inputPaths: string[], outputPath: string): string[] {
  if (inputPaths.length !== RENDERER_SPEC.imageCount) fail("ALLOCATED_USAGE_ALLOCATION_MISMATCH");
  const args: string[] = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  for (const inputPath of inputPaths) {
    args.push("-loop", "1", "-framerate", String(RENDERER_SPEC.fps), "-t", String(RENDERER_SPEC.secondsPerImage), "-i", inputPath);
  }
  const filters = inputPaths.map((_, index) => (
    `[${index}:v]scale=${RENDERER_SPEC.width}:${RENDERER_SPEC.height}:force_original_aspect_ratio=decrease,`
    + `pad=${RENDERER_SPEC.width}:${RENDERER_SPEC.height}:(ow-iw)/2:(oh-ih)/2:color=black,`
    + `setsar=1,fps=${RENDERER_SPEC.fps},trim=duration=${RENDERER_SPEC.secondsPerImage},setpts=PTS-STARTPTS[v${index}]`
  ));
  args.push(
    "-filter_complex",
    `${filters.join(";")};${inputPaths.map((_, index) => `[v${index}]`).join("")}concat=n=${inputPaths.length}:v=1:a=0,format=${RENDERER_SPEC.pixelFormat}[outv]`,
    "-map", "[outv]",
    "-an",
    "-c:v", RENDERER_SPEC.encoder,
    "-preset", "medium",
    "-crf", "18",
    "-pix_fmt", RENDERER_SPEC.pixelFormat,
    "-r", String(RENDERER_SPEC.fps),
    "-fps_mode", "cfr",
    "-g", String(RENDERER_SPEC.fps),
    "-keyint_min", String(RENDERER_SPEC.fps),
    "-bf", "0",
    "-threads", "1",
    "-x264-params", "threads=1:lookahead_threads=1:sliced_threads=0:sync_lookahead=0:scenecut=0:open_gop=0",
    "-map_metadata", "-1",
    "-metadata", `encoder=${RENDERER_SPEC.name}`,
    "-fflags", "+bitexact",
    "-flags:v", "+bitexact",
    "-movflags", "+faststart",
    "-t", String(RENDERER_SPEC.durationSeconds),
    "-y",
    outputPath,
  );
  return args;
}

async function inspectRenderedVideo(
  path: string,
  injectedProbe?: (path: string) => Promise<AllocatedUsageVideoProbe>,
): Promise<AllocatedUsageVideoProbe> {
  let probe: AllocatedUsageVideoProbe;
  try {
    probe = await (injectedProbe ?? probeVideo)(path);
  } catch {
    fail("ALLOCATED_USAGE_MEDIA_PROFILE_INVALID");
  }
  if (
    probe.videoCodec !== RENDERER_SPEC.videoCodec
    || probe.width !== RENDERER_SPEC.width
    || probe.height !== RENDERER_SPEC.height
    || Math.abs(probe.fps - RENDERER_SPEC.fps) > 0.01
    || Math.abs(probe.durationSeconds - RENDERER_SPEC.durationSeconds) > 0.1
    || probe.audioStreamCount !== RENDERER_SPEC.audioStreamCount
  ) {
    fail("ALLOCATED_USAGE_MEDIA_PROFILE_INVALID");
  }
  return probe;
}

async function runFfmpeg(args: readonly string[]): Promise<void> {
  await execFileAsync("ffmpeg", [...args], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
    shell: false,
    timeout: 120_000,
    windowsHide: true,
  });
}

async function probeVideo(path: string): Promise<AllocatedUsageVideoProbe> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "stream=codec_name,codec_type,width,height,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    "--", path,
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    shell: false,
    timeout: 60_000,
    windowsHide: true,
  });
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_name?: string; codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
    format?: { duration?: string };
  };
  const videos = parsed.streams?.filter(({ codec_type }) => codec_type === "video") ?? [];
  const audioStreamCount = parsed.streams?.filter(({ codec_type }) => codec_type === "audio").length ?? 0;
  if (videos.length !== 1) fail("ALLOCATED_USAGE_MEDIA_PROFILE_INVALID");
  const video = videos[0];
  return {
    videoCodec: video.codec_name ?? "",
    width: video.width ?? 0,
    height: video.height ?? 0,
    fps: parseFrameRate(video.r_frame_rate ?? ""),
    durationSeconds: Number(parsed.format?.duration ?? 0),
    audioStreamCount,
  };
}

async function validateExistingMaterialization(input: {
  input: Parameters<typeof materializeAllocatedUsageEvidence>[0];
  selected: SelectedAsset[];
  reviewClass: AllocatedUsageReviewClass;
  registrySha256: string;
  allocationSha256: string;
  rendererSpecSha256: string;
  materializationId: string;
  videoPath: string;
  manifestPath: string;
  dependencies: AllocatedUsageEvidenceDependencies;
}): Promise<AllocatedGenericUsageEvidence> {
  const media = await inspectRenderedVideo(input.videoPath, input.dependencies.probeVideo);
  const videoSha256 = await sha256File(input.videoPath).catch(() => fail("ALLOCATED_USAGE_OUTPUT_CONFLICT"));
  const sizeBytes = await stat(input.videoPath).then((value) => value.size).catch(() => 0);
  let manifest: unknown;
  try {
    manifest = JSON.parse(await readFile(input.manifestPath, "utf8"));
  } catch {
    fail("ALLOCATED_USAGE_OUTPUT_CONFLICT");
  }
  const expected = buildManifest({
    input: input.input,
    selected: input.selected,
    reviewClass: input.reviewClass,
    registrySha256: input.registrySha256,
    allocationSha256: input.allocationSha256,
    rendererSpecSha256: input.rendererSpecSha256,
    materializationId: input.materializationId,
    videoFileName: input.videoPath.split(/[\\/]/u).slice(-1)[0] ?? "",
    videoSha256,
    sizeBytes,
    media,
  });
  if (stableJson(manifest) !== stableJson(expected)) fail("ALLOCATED_USAGE_OUTPUT_CONFLICT");
  return toApprovedEvidence(
    input.input.productKey,
    input.materializationId,
    input.videoPath,
    input.manifestPath,
    expected,
    await sha256File(input.manifestPath),
  );
}

function buildManifest(input: {
  input: Parameters<typeof materializeAllocatedUsageEvidence>[0];
  selected: SelectedAsset[];
  reviewClass: AllocatedUsageReviewClass;
  registrySha256: string;
  allocationSha256: string;
  rendererSpecSha256: string;
  materializationId: string;
  videoFileName: string;
  videoSha256: string;
  sizeBytes: number;
  media: AllocatedUsageVideoProbe;
}): SanitizedManifest {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    materializationId: input.materializationId,
    productKey: input.input.productKey,
    useCase: input.input.allocation.useCase,
    packId: input.input.allocation.packId,
    sequenceFingerprint: input.input.allocation.sequenceFingerprint,
    registrySha256: input.registrySha256,
    allocationSha256: input.allocationSha256,
    rendererSpecSha256: input.rendererSpecSha256,
    reviewClass: input.reviewClass,
    identityType: "generic_usage_example",
    ownerReviewStatus: "pass",
    noUploadAutomationEligible: true,
    publishEligible: false,
    SAFE_TO_UPLOAD: false,
    assets: input.selected.map(({ asset, sha256 }) => ({
      assetId: asset.assetId,
      sourceId: asset.sourceId,
      sourceSha256: asset.sourceSha256,
      localImageSha256: sha256,
      sceneRoles: [...asset.sceneRoles],
      reviewClass: input.reviewClass,
    })),
    output: {
      fileName: input.videoFileName,
      sha256: input.videoSha256,
      sizeBytes: input.sizeBytes,
      videoCodec: "h264",
      width: 1080,
      height: 1920,
      fps: 30,
      durationSeconds: 9,
      audioStreamCount: 0,
    },
  };
}

function toApprovedEvidence(
  productKey: string,
  materializationId: string,
  videoPath: string,
  manifestPath: string,
  manifest: SanitizedManifest,
  reviewEvidenceSha256: string,
): AllocatedGenericUsageEvidence {
  return {
    assetId: `allocated-usage-${materializationId}`,
    productKey,
    sourcePath: videoPath,
    sourceSha256: manifest.output.sha256,
    reviewEvidencePath: manifestPath,
    reviewEvidenceSha256,
    sourceType: "allocated_sanitized_local_scene_pack",
    identityType: "generic_usage_example",
    usageType: "real_use_context",
    approvalStatus: "approved",
    ownerReviewStatus: "pass",
    reviewClass: manifest.reviewClass,
    noUploadAutomationEligible: true,
    publishEligible: false,
    SAFE_TO_UPLOAD: false,
    provenance: {
      schemaVersion: PROVENANCE_SCHEMA_VERSION,
      registrySha256: manifest.registrySha256,
      allocationSha256: manifest.allocationSha256,
      rendererSpecSha256: manifest.rendererSpecSha256,
      packId: manifest.packId,
      useCase: manifest.useCase,
      sequenceFingerprint: manifest.sequenceFingerprint,
      assetIds: manifest.assets.map(({ assetId }) => assetId),
      sourceIds: manifest.assets.map(({ sourceId }) => sourceId),
      sourceImageSha256s: manifest.assets.map(({ localImageSha256 }) => localImageSha256),
      outputSha256: manifest.output.sha256,
    },
  };
}

function classifyReview(assets: UsageEvidenceAsset[]): AllocatedUsageReviewClass {
  return assets.every((asset) => asset.humanOwnerReviewStatus === "pass" && asset.sourceHumanReviewStatus === "pass")
    ? "HUMAN_AND_CODEX_REVIEWED_LOCAL_ONLY"
    : "CODEX_REVIEWED_LOCAL_ONLY";
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseFrameRate(value: string): number {
  const [numerator, denominator] = value.split("/").map(Number);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return Number.NaN;
  return numerator / denominator;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isSha256(value: string): boolean {
  return /^[0-9a-f]{64}$/u.test(value);
}

function safeImageExtension(path: string): string {
  const extension = extname(path).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/u.test(extension) ? extension : ".image";
}

function validateIdentifier(value: string, code: string): void {
  if (!value || value.length > 256 || /[\u0000-\u001f\u007f]/u.test(value)) fail(code);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function createStagingDirectory(outputDir: string): Promise<string> {
  try {
    return await mkdtemp(join(outputDir, ".allocated-usage-staging-"));
  } catch {
    fail("ALLOCATED_USAGE_OUTPUT_NOT_AVAILABLE");
  }
}

function isKnownFailure(error: unknown): error is Error {
  return error instanceof Error && /^(ALLOCATED_USAGE_|USAGE_EVIDENCE_)/u.test(error.message);
}

function fail(code: string): never {
  throw new Error(code);
}
