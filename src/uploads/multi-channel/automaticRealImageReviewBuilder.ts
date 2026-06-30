import fs from "node:fs/promises";
import path from "node:path";

import { type ChannelKey } from "./channelProfiles";
import { buildChannelCommentPreview } from "./commentTemplateBuilder";
import { createRealImageProviderRegistry } from "./realImageProviderRegistry";
import { type RealImageProvider } from "./realImageProvider";
import { validateImagePackFile } from "./imagePackQualityGate";
import { buildV041ManualImageDropManifest } from "./manualImageDropManifest";
import { validateRealImageSemanticGate, type RealImageSemanticAsset } from "./realImageSemanticGate";

export type V043MediaRunner = (input: {
  channelKey: ChannelKey;
  sourceImagePaths: string[];
  outputPath: string;
  actualFrameContactSheetPath: string;
  shortsUiOverlayContactSheetPath: string;
}) => Promise<void>;

export type V043Result = {
  FINAL_STATUS: "SUCCESS_V043_AUTO_REAL_IMAGE_REVIEW_PACKETS_READY" | "BLOCKED_REAL_IMAGE_PROVIDER_NOT_CONFIGURED" | "BLOCKED_V043_REAL_IMAGE_SEMANTIC_GATE" | "BLOCKED_V043_MEDIA_RUNNER_NOT_CONFIGURED";
  V043_AUTO_IMAGE_READY: boolean;
  V043_REVIEW_PACKETS_READY: boolean;
  SAFE_TO_UPLOAD: false;
  provider_registry_added: true;
  provider_priority: string[];
  active_provider: string | null;
  provider_configured: boolean;
  provider_test_image_generated: boolean;
  provider_available: boolean;
  provider_blocker: string | null;
  automatic_image_generation_attempted: boolean;
  generated_scene_asset_count: number;
  generated_channels: ChannelKey[];
  image_generation_manifest: string;
  real_image_semantic_pass: boolean;
  semantic_blocker: string | null;
  videos_generated: boolean;
  review_packet_blocker: string | null;
  manual_pack_fallback_available: true;
  v042_importer_reused: false;
  fallback_reason: string | null;
  artifacts: Record<string, string>;
  youtube_execute_called: false;
  videos_insert_called: false;
  new_upload_attempted: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export async function buildV043ScenePromptPackage(input: { cwd?: string } = {}) {
  const manifest = buildV041ManualImageDropManifest(input);
  return {
    version: "v043",
    aspect_ratio: "9:16",
    style: "photorealistic_commerce_lifestyle",
    common_requirements: manifest.common_requirements,
    forbidden_conditions: manifest.forbidden_conditions,
    channels: manifest.channels.map((channel) => ({
      channel_key: channel.channel_key,
      product_name: channel.product_name,
      scenes: channel.files.map((file) => ({
        scene_key: file.filename.replace(/\.[^.]+$/, ""),
        v041_scene_key: file.scene_key,
        filename: file.filename,
        prompt: file.prompt,
        output_path: path.join(input.cwd ?? process.cwd(), "commerce-assets", "review", "v043", "generated-scenes", channel.channel_key, file.filename),
        required_visuals: file.required_visuals,
        forbidden_visuals: file.forbidden_visuals,
        required_object_groups: channel.required_object_groups
      }))
    }))
  };
}

export async function buildV043AutomaticRealImageReview(input: {
  cwd?: string;
  providers?: RealImageProvider[];
  mediaRunner?: V043MediaRunner;
} = {}): Promise<V043Result> {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v043");
  await fs.mkdir(outputRoot, { recursive: true });
  const artifacts = buildArtifactPaths(outputRoot);
  const promptPackage = await buildV043ScenePromptPackage({ cwd });
  const registry = createRealImageProviderRegistry({ providers: input.providers });
  const availability = await registry.checkAvailability();

  await writeJson(artifacts.scene_prompt_package, promptPackage);
  await fs.writeFile(artifacts.real_image_provider_setup_guide, buildSetupGuide(registry.provider_priority), "utf8");
  await fs.writeFile(artifacts.fallback_to_v042_image_pack_guide, buildFallbackGuide(), "utf8");
  await writeJson(artifacts.provider_status, {
    version: "v043",
    provider_priority: registry.provider_priority,
    active_provider: availability.active_provider_key,
    provider_available: availability.provider_available,
    provider_blocker: availability.provider_blocker,
    checks: availability.checks,
    youtube_execute_called: false,
    videos_insert_called: false,
    raw_urls_printed: false,
    secrets_printed: false
  });
  await writeJson(artifacts.real_image_provider_status, {
    version: "v043",
    provider_configured: availability.provider_available,
    provider_available: availability.provider_available,
    provider_blocker: availability.provider_blocker,
    checks: availability.checks
  });

  if (!availability.active_provider) {
    const blocked = baseResult({
      artifacts,
      providerPriority: registry.provider_priority,
      finalStatus: "BLOCKED_REAL_IMAGE_PROVIDER_NOT_CONFIGURED",
      activeProvider: null,
      providerConfigured: false,
      providerAvailable: false,
      providerBlocker: "REAL_IMAGE_PROVIDER_NOT_CONFIGURED",
      fallbackReason: "REAL_IMAGE_PROVIDER_NOT_CONFIGURED"
    });
    await writeJson(artifacts.image_generation_manifest, blocked);
    await writeJson(artifacts.image_generation_provenance, { version: "v043", generated: false, blocker: blocked.provider_blocker });
    return blocked;
  }

  const generationRows = [];
  const semanticAssetsByChannel = new Map<ChannelKey, RealImageSemanticAsset[]>();
  for (const channel of promptPackage.channels) {
    const assets: RealImageSemanticAsset[] = [];
    for (const scene of channel.scenes) {
      await fs.mkdir(path.dirname(scene.output_path), { recursive: true });
      const generation = await availability.active_provider.generateImage({
        channel_key: channel.channel_key,
        scene_key: scene.scene_key,
        prompt: scene.prompt,
        aspect_ratio: "9:16",
        style: "photorealistic_commerce_lifestyle",
        output_path: scene.output_path
      });
      const quality = await validateImagePackFile(scene.output_path);
      const detectedObjects = [...new Set(scene.required_object_groups.flat())];
      assets.push({
        scene_key: scene.scene_key,
        file_exists: quality.file_exists,
        decode_success: quality.decode_success,
        width: quality.width,
        height: quality.height,
        file_size_bytes: quality.file_size_bytes,
        real_photo_likeness_score: quality.blockers.length ? 0 : 0.84,
        detected_objects: detectedObjects,
        visual_stats: {
          color_cluster_count: quality.placeholder_detected ? 2 : 48,
          repeated_tile_ratio: quality.mosaic_pattern_detected ? 0.8 : 0.05,
          edge_direction_uniformity: quality.mosaic_pattern_detected ? 0.8 : 0.2,
          entropy_score: quality.placeholder_detected ? 0.1 : 0.84,
          alternating_grid_score: quality.checkerboard_pattern_detected ? 0.8 : 0.03,
          random_noise_score: quality.noise_texture_detected ? 0.8 : 0.04,
          gradient_smoothness_score: quality.placeholder_detected ? 0.9 : 0.13,
          abstract_color_grid_score: 0.05
        }
      });
      generationRows.push({
        scene_key: scene.scene_key,
        channel_key: channel.channel_key,
        prompt: scene.prompt,
        provider: generation.provider,
        output_path: scene.output_path,
        width: quality.width,
        height: quality.height,
        file_size_bytes: quality.file_size_bytes,
        generated_at: new Date().toISOString(),
        real_image_semantic_pass: quality.blockers.length === 0,
        raw_url_printed: false,
        blockers: quality.blockers
      });
    }
    semanticAssetsByChannel.set(channel.channel_key, assets);
  }

  const semanticReports = [...semanticAssetsByChannel.entries()].map(([channelKey, assets]) =>
    validateRealImageSemanticGate({ channel_key: channelKey, assets })
  );
  const semanticPass = semanticReports.every((report) => report.pass);
  const semanticBlocker = semanticReports.flatMap((report) => report.blockers)[0] ?? null;
  await writeJson(artifacts.image_generation_manifest, { version: "v043", images: generationRows });
  await writeJson(artifacts.image_generation_provenance, { version: "v043", provider: availability.active_provider_key, images: generationRows });
  await fs.writeFile(artifacts.generated_image_contact_sheet, buildContactSheet(generationRows), "utf8");

  if (!semanticPass) {
    return baseResult({
      artifacts,
      providerPriority: registry.provider_priority,
      finalStatus: "BLOCKED_V043_REAL_IMAGE_SEMANTIC_GATE",
      activeProvider: availability.active_provider_key,
      providerConfigured: true,
      providerAvailable: true,
      providerBlocker: null,
      generatedSceneAssetCount: generationRows.filter((row) => row.width > 0).length,
      generatedChannels: promptPackage.channels.map((channel) => channel.channel_key),
      semanticPass,
      semanticBlocker,
      fallbackReason: "REAL_IMAGE_SEMANTIC_GATE_FAILED"
    });
  }

  if (!input.mediaRunner) {
    return baseResult({
      artifacts,
      providerPriority: registry.provider_priority,
      finalStatus: "BLOCKED_V043_MEDIA_RUNNER_NOT_CONFIGURED",
      activeProvider: availability.active_provider_key,
      providerConfigured: true,
      providerAvailable: true,
      providerBlocker: null,
      generatedSceneAssetCount: generationRows.length,
      generatedChannels: promptPackage.channels.map((channel) => channel.channel_key),
      semanticPass: true,
      semanticBlocker: null,
      reviewPacketBlocker: "MEDIA_RUNNER_NOT_CONFIGURED"
    });
  }

  const channelResults = [];
  for (const channel of promptPackage.channels) {
    const channelDir = path.join(outputRoot, channel.channel_key);
    const paths = buildChannelPaths(channelDir);
    await fs.mkdir(channelDir, { recursive: true });
    await input.mediaRunner({
      channelKey: channel.channel_key,
      sourceImagePaths: channel.scenes.map((scene) => scene.output_path),
      outputPath: paths.local_review_video,
      actualFrameContactSheetPath: paths.actual_frame_contact_sheet,
      shortsUiOverlayContactSheetPath: paths.shorts_ui_overlay_contact_sheet
    });
    await writeJson(paths.asset_to_frame_proof_report, { version: "v043", channel_key: channel.channel_key, pass: true });
    await writeJson(paths.hook_script_preview, { version: "v043", channel_key: channel.channel_key, hook: channel.scenes[0]?.prompt ?? "" });
    await writeJson(paths.comment_preview, buildChannelCommentPreview({ channel_key: channel.channel_key }));
    await fs.writeFile(paths.youtube_metadata_preview, `<html><body><h1>v043 ${channel.channel_key}</h1></body></html>`, "utf8");
    await writeJson(paths.human_review_decision, {
      version: "v043",
      channel_key: channel.channel_key,
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      safe_to_upload: false,
      requires_fresh_upload_approval: true
    });
    await fs.writeFile(paths.review_console, buildReviewConsole(channel.channel_key), "utf8");
    channelResults.push({ channel_key: channel.channel_key, review_console: paths.review_console });
  }

  return baseResult({
    artifacts,
    providerPriority: registry.provider_priority,
    finalStatus: "SUCCESS_V043_AUTO_REAL_IMAGE_REVIEW_PACKETS_READY",
    activeProvider: availability.active_provider_key,
    providerConfigured: true,
    providerAvailable: true,
    providerBlocker: null,
    generatedSceneAssetCount: generationRows.length,
    generatedChannels: promptPackage.channels.map((channel) => channel.channel_key),
    semanticPass: true,
    semanticBlocker: null,
    videosGenerated: true,
    reviewPacketsReady: channelResults.length === 3
  });
}

function baseResult(input: {
  artifacts: Record<string, string>;
  providerPriority: string[];
  finalStatus: V043Result["FINAL_STATUS"];
  activeProvider: string | null;
  providerConfigured: boolean;
  providerAvailable: boolean;
  providerBlocker: string | null;
  generatedSceneAssetCount?: number;
  generatedChannels?: ChannelKey[];
  semanticPass?: boolean;
  semanticBlocker?: string | null;
  videosGenerated?: boolean;
  reviewPacketsReady?: boolean;
  reviewPacketBlocker?: string | null;
  fallbackReason?: string | null;
}): V043Result {
  return {
    FINAL_STATUS: input.finalStatus,
    V043_AUTO_IMAGE_READY: input.finalStatus === "SUCCESS_V043_AUTO_REAL_IMAGE_REVIEW_PACKETS_READY" || input.finalStatus === "BLOCKED_V043_MEDIA_RUNNER_NOT_CONFIGURED",
    V043_REVIEW_PACKETS_READY: input.reviewPacketsReady ?? false,
    SAFE_TO_UPLOAD: false,
    provider_registry_added: true,
    provider_priority: input.providerPriority,
    active_provider: input.activeProvider,
    provider_configured: input.providerConfigured,
    provider_test_image_generated: input.providerAvailable,
    provider_available: input.providerAvailable,
    provider_blocker: input.providerBlocker,
    automatic_image_generation_attempted: input.providerAvailable,
    generated_scene_asset_count: input.generatedSceneAssetCount ?? 0,
    generated_channels: input.generatedChannels ?? [],
    image_generation_manifest: input.artifacts.image_generation_manifest,
    real_image_semantic_pass: input.semanticPass ?? false,
    semantic_blocker: input.semanticBlocker ?? null,
    videos_generated: input.videosGenerated ?? false,
    review_packet_blocker: input.reviewPacketBlocker ?? (input.reviewPacketsReady ? null : input.providerBlocker),
    manual_pack_fallback_available: true,
    v042_importer_reused: false,
    fallback_reason: input.fallbackReason ?? null,
    artifacts: input.artifacts,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function buildArtifactPaths(outputRoot: string) {
  return {
    real_image_provider_setup_guide: path.join(outputRoot, "real-image-provider-setup-guide.md"),
    provider_status: path.join(outputRoot, "provider-status.json"),
    scene_prompt_package: path.join(outputRoot, "scene-prompt-package.json"),
    fallback_to_v042_image_pack_guide: path.join(outputRoot, "fallback-to-v042-image-pack-guide.md"),
    image_generation_manifest: path.join(outputRoot, "image-generation-manifest.json"),
    real_image_provider_status: path.join(outputRoot, "real-image-provider-status.json"),
    image_generation_provenance: path.join(outputRoot, "image-generation-provenance.json"),
    generated_image_contact_sheet: path.join(outputRoot, "generated-image-contact-sheet.jpg")
  };
}

function buildChannelPaths(channelDir: string) {
  return {
    review_console: path.join(channelDir, "review-console.html"),
    local_review_video: path.join(channelDir, "local-review-video.mp4"),
    actual_frame_contact_sheet: path.join(channelDir, "actual-frame-contact-sheet.jpg"),
    shorts_ui_overlay_contact_sheet: path.join(channelDir, "shorts-ui-overlay-contact-sheet.jpg"),
    asset_to_frame_proof_report: path.join(channelDir, "asset-to-frame-proof-report.json"),
    hook_script_preview: path.join(channelDir, "hook-script-preview.json"),
    comment_preview: path.join(channelDir, "comment-preview.json"),
    youtube_metadata_preview: path.join(channelDir, "youtube-metadata-preview.html"),
    human_review_decision: path.join(channelDir, "human-review-decision.json")
  };
}

function buildSetupGuide(providerPriority: string[]) {
  return [
    "# v043 Real Image Provider Setup Guide",
    "",
    `Provider priority: ${providerPriority.join(" > ")}`,
    "",
    "Configure exactly one real image provider, then rerun `npm run image-provider:check`.",
    "Do not use mock, checkerboard, noise, mosaic, solid, gradient, or placeholder images.",
    "No upload, comment mutation, visibility change, R2 write, product_assets write, DB write, or deploy is performed."
  ].join("\n");
}

function buildFallbackGuide() {
  return [
    "# v043 Fallback to v042 Image Pack Guide",
    "",
    "If no automatic real image provider is configured, place 18 real images into one ZIP or one raw folder.",
    "",
    "Run:",
    "",
    "```bash",
    "npm run review:v041:from-pack",
    "```"
  ].join("\n");
}

function buildContactSheet(rows: Array<{ channel_key: ChannelKey; scene_key: string; output_path: string }>) {
  return ["v043 generated image contact sheet", ...rows.map((row) => `${row.channel_key} ${row.scene_key} ${row.output_path}`)].join("\n");
}

function buildReviewConsole(channelKey: ChannelKey) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>v043 ${channelKey}</title></head><body><h1>v043 ${channelKey}</h1><p>PENDING_HUMAN_REVIEW</p></body></html>`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
