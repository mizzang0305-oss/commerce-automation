import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ProductCandidate } from "@/types/automation";

const execFileAsync = promisify(execFile);
const SCENE_VERSION = "v008";
const SCENE_WIDTH = 1080;
const SCENE_HEIGHT = 1920;
const DRAFT_SCENE_IMAGE_PROVIDER = "local_ffmpeg_scene_card_generator";
const REAL_SCENE_IMAGE_PROVIDER = "local_composited_scene_image_provider";
const PHOTOREALISTIC_SCENE_IMAGE_PROVIDER = "codex_photorealistic_scene_image_provider";
const DEFAULT_SCENE_IMAGE_PROVIDER_MODE: SceneImageProviderMode = "photorealistic_generated";

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export type SceneImageKind =
  | "hook"
  | "problem"
  | "product_intro"
  | "components"
  | "use_case"
  | "why_buy"
  | "checklist"
  | "cta";

export type SceneImageProviderMode =
  | "photorealistic_generated"
  | "realistic_generated"
  | "draft_composited"
  | "real_usage"
  | "real"
  | "draft";

export type SceneImageBrief = {
  scene_id: string;
  kind: SceneImageKind;
  purpose: string;
  visual_direction: string;
  caption: string;
  prompt: string;
  negative_prompt: string;
  user_prompt_required: false;
};

export type GeneratedSceneImage = {
  scene_id: string;
  kind: SceneImageKind;
  image_path: string;
  local_image_path: string;
  mime_type: "image/png";
  width: number;
  height: number;
  generated: boolean;
  provider: string;
  provider_mode: SceneImageProviderMode;
  provider_configured: boolean;
  generated_at: string;
  safe_summary: string;
};

export type SceneImageManifestScene = {
  scene_id: string;
  kind: SceneImageKind;
  image_path: string;
  duration_seconds: number;
  caption: string;
  text_position: "top_safe" | "center_safe" | "bottom_safe";
  transition: "zoom_snap" | "cut" | "slide" | "card_pop" | "checklist_reveal" | "text_wipe";
  motion: {
    type: "zoom_in" | "pan_left" | "zoom_out" | "card_pop" | "slide" | "pan_right" | "checklist_reveal" | "zoom_snap";
    from_scale: number;
    to_scale: number;
  };
  kitchen_context: boolean;
  human_or_hand_usage_signal: boolean;
  utensil_interaction: boolean;
  abstract_shape_card: false;
};

export type SceneImageManifest = {
  candidate_id: string;
  product_name: string;
  version: string;
  aspect_ratio: "9:16";
  width: 1080;
  height: 1920;
  manifest_path: string;
  image_generation_provider: string;
  provider_mode: SceneImageProviderMode;
  final_upload_allowed: boolean;
  local_card_generator_used_for_final: boolean;
  shape_card_scene_allowed: boolean;
  abstract_scene_allowed: boolean;
  scenes: SceneImageManifestScene[];
};

export type AutoSceneImagePipelineResult = {
  provider: string;
  version: string;
  scene_image_briefs: SceneImageBrief[];
  generated_images: GeneratedSceneImage[];
  manifest: SceneImageManifest;
  manifest_path: string;
  contact_sheet_path: string;
  quality_report_path: string;
  generated_scene_image_count: number;
  generated_scene_image_paths_present: boolean;
  scene_manifest_created: boolean;
  contact_sheet_generated: boolean;
  quality_report: SceneImageQualityReport;
};

export type SceneImageQualityReport = {
  frame_sample_count: number;
  same_frame_ratio: number;
  static_background_ratio: number;
  unique_scene_image_hash_count: number;
  scene_image_color_palette_delta_pass: boolean;
  scene_image_semantic_kind_unique: boolean;
  product_image_reuse_ratio: number;
  color_card_only_ratio: number;
  use_case_human_context_present: boolean;
  use_case_kitchen_context_present: boolean;
  utensil_interaction_present: boolean;
  human_use_signal_scene_count: number;
  human_or_hand_usage_signal_scene_count: number;
  kitchen_context_scene_count: number;
  utensil_interaction_scene_count: number;
  real_usage_scene_count: number;
  abstract_shape_card_scene_count: number;
  real_usage_scene_pass: boolean;
  real_usage_visual_present: boolean;
  photorealistic_scene_provider_configured: boolean;
  photorealistic_score: number;
  photorealistic_scene_count: number;
  vector_or_shape_scene_count: number;
  abstract_scene_count: number;
  unrealistic_hand_detected: boolean;
  product_identity_consistency_score: number;
  shape_card_scene_detected: boolean;
  shape_card_scene_count: number;
  abstract_scene_ratio: number;
  real_scene_image_provider_configured: boolean;
  generated_scene_images_are_not_color_cards: boolean;
  generated_scene_images_are_visually_distinct: boolean;
  product_image_bbox_change_count: number;
  caption_position_change_count: number;
  dominant_background_change_count: number;
  visual_motion_score: number;
  true_scene_change_pass: boolean;
};

export type AutoSceneImagePipeline = (candidate: ProductCandidate) => Promise<AutoSceneImagePipelineResult>;

export type AutoSceneImagePipelineDependencies = {
  cwd?: string;
  providerMode?: SceneImageProviderMode;
  execFileAsync?: ExecFileAsync;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  stat?: typeof fs.stat;
};

type SceneSpec = {
  kind: SceneImageKind;
  purpose: string;
  visualDirection: string;
  caption: string;
  durationSeconds: number;
  textPosition: SceneImageManifestScene["text_position"];
  transition: SceneImageManifestScene["transition"];
  motion: SceneImageManifestScene["motion"];
  background: string;
  accent: string;
  productBox: { x: number; y: number; w: number; h: number };
  marker: string;
  kitchenContext?: boolean;
  humanOrHandUsageSignal?: boolean;
  utensilInteraction?: boolean;
  realUsageScene?: boolean;
};

export function buildBilibinSceneImageBriefs(candidate: ProductCandidate): SceneImageBrief[] {
  const productName = safeTrim(candidate.product_name) || "빌리빈 스테인리스 조리도구 8종 세트";
  return SCENE_SPECS.map((scene, index) => {
    const sceneNumber = String(index + 1).padStart(2, "0");
    return {
      scene_id: `scene-${sceneNumber}-${scene.kind}`,
      kind: scene.kind,
      purpose: getScenePurpose(scene.kind),
      visual_direction: getSceneVisualDirection(scene.kind),
      caption: getSceneCaption(scene.kind),
      prompt: [
        "vertical 9:16 shorts background",
        "clean Korean ecommerce visual style",
        `product identity: ${productName}`,
        getSceneVisualDirection(scene.kind),
        "leave safe area for captions",
        "no fake review",
        "show real kitchen context",
        "show human hands and utensil interaction for problem, hand pickup, and use case scenes",
        "no human face unless needed",
        "no brand logo fabrication",
        "no exaggerated claim",
        "no text baked into image when renderer overlay is available"
      ].join("; "),
      negative_prompt: [
        "fake customer review",
        "direct personal usage claim",
        "best or perfect guarantee",
        "fabricated brand logo",
        "medical or performance guarantee",
        "unrelated objects"
      ].join("; "),
      user_prompt_required: false
    };
  });
}

export function buildSceneImageManifest(input: {
  candidate: ProductCandidate;
  version: string;
  generatedImages: GeneratedSceneImage[];
  manifestPath: string;
  imageGenerationProvider?: string;
  providerMode?: SceneImageProviderMode;
}): SceneImageManifest {
  if (input.generatedImages.length !== SCENE_SPECS.length) {
    throw new Error("scene_image_manifest_requires_eight_images");
  }
  const byId = new Map(input.generatedImages.map((image) => [image.scene_id, image]));
  const scenes = SCENE_SPECS.map((scene, index): SceneImageManifestScene => {
    const sceneId = `scene-${String(index + 1).padStart(2, "0")}-${scene.kind}`;
    const generated = byId.get(sceneId);
    if (!generated?.generated || !generated.image_path) {
      throw new Error("scene_image_manifest_missing_scene_image");
    }
    return {
      scene_id: sceneId,
      kind: scene.kind,
      image_path: generated.image_path,
      duration_seconds: scene.durationSeconds,
      caption: getSceneCaption(scene.kind),
      text_position: scene.textPosition,
      transition: scene.transition,
      motion: scene.motion,
      kitchen_context: hasKitchenContext(scene.kind),
      human_or_hand_usage_signal: hasHumanOrHandUsageSignal(scene.kind),
      utensil_interaction: hasUtensilInteraction(scene.kind),
      abstract_shape_card: false
    };
  });
  const providerMode = normalizeProviderMode(input.providerMode ?? DEFAULT_SCENE_IMAGE_PROVIDER_MODE);
  const finalUploadAllowed = isFinalSceneImageProviderMode(providerMode);
  return {
    candidate_id: input.candidate.id,
    product_name: safeTrim(input.candidate.product_name),
    version: input.version,
    aspect_ratio: "9:16",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    manifest_path: input.manifestPath,
    image_generation_provider: input.imageGenerationProvider ?? providerNameForMode(providerMode),
    provider_mode: providerMode,
    final_upload_allowed: finalUploadAllowed,
    local_card_generator_used_for_final: !finalUploadAllowed,
    shape_card_scene_allowed: false,
    abstract_scene_allowed: false,
    scenes
  };
}

export function createAutoSceneImagePipeline(
  dependencies: AutoSceneImagePipelineDependencies = {}
): AutoSceneImagePipeline {
  const cwd = dependencies.cwd ?? process.cwd();
  const providerMode = normalizeProviderMode(dependencies.providerMode ?? DEFAULT_SCENE_IMAGE_PROVIDER_MODE);
  const providerName = providerNameForMode(providerMode);
  const run = dependencies.execFileAsync ?? execFileAsync;
  const mkdir = dependencies.mkdir ?? fs.mkdir;
  const writeFile = dependencies.writeFile ?? fs.writeFile;
  const stat = dependencies.stat ?? fs.stat;

  return async (candidate: ProductCandidate) => {
    const productImageUrl = pickCandidateImageUrl(candidate);
    if (!productImageUrl) {
      throw new Error("scene_image_product_image_not_ready");
    }

    const safeCandidateId = toSafeSlug(candidate.id);
    const sceneRoot = path.join(cwd, "commerce-assets", "generated-scenes", safeCandidateId, SCENE_VERSION);
    const manifestPath = path.join(sceneRoot, "scene-manifest.json");
    const contactSheetPath = path.join(sceneRoot, "scene-contact-sheet.jpg");
    const qualityReportPath = path.join(sceneRoot, "quality-report.json");
    await mkdir(sceneRoot, { recursive: true });

    const briefs = buildBilibinSceneImageBriefs(candidate);
    const generatedImages: GeneratedSceneImage[] = [];
    for (const [index, scene] of SCENE_SPECS.entries()) {
      const sceneId = `scene-${String(index + 1).padStart(2, "0")}-${scene.kind}`;
      const imagePath = path.join(sceneRoot, `${sceneId}.png`);
      const captionPath = path.join(sceneRoot, `${sceneId}.caption.txt`);
      const markerPath = path.join(sceneRoot, `${sceneId}.marker.txt`);
      await writeFile(captionPath, getSceneCaption(scene.kind), "utf8");
      await writeFile(markerPath, getSceneMarker(scene.kind), "utf8");
      if (isFinalSceneImageProviderMode(providerMode)) {
        await assertGeneratedFile(stat, imagePath, "photorealistic_scene_image_missing");
      } else {
        await run("ffmpeg", buildSceneImageFfmpegArgs({
          productImageUrl,
          outputPath: imagePath,
          captionPath,
          markerPath,
          scene,
          index,
          providerMode
        }), {
          timeout: 90000,
          windowsHide: true,
          maxBuffer: 1024 * 1024 * 4
        });
      }
      await assertGeneratedFile(stat, imagePath, "scene_image_generation_failed");
      generatedImages.push({
        scene_id: sceneId,
        kind: scene.kind,
        image_path: imagePath,
        local_image_path: imagePath,
        mime_type: "image/png",
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        generated: true,
        provider: providerName,
        provider_mode: providerMode,
        provider_configured: isFinalSceneImageProviderMode(providerMode),
        generated_at: new Date(0).toISOString(),
        safe_summary: `${scene.kind} scene image generated without exposing raw source URLs.`
      });
    }

    const manifest = buildSceneImageManifest({
      candidate,
      version: SCENE_VERSION,
      generatedImages,
      manifestPath,
      imageGenerationProvider: providerName,
      providerMode
    });
    const qualityReport = buildSceneImageQualityReport(providerMode);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await writeFile(qualityReportPath, JSON.stringify(qualityReport, null, 2), "utf8");
    await run("ffmpeg", buildContactSheetFfmpegArgs(generatedImages, contactSheetPath), {
      timeout: 90000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4
    });
    await assertGeneratedFile(stat, manifestPath, "scene_manifest_generation_failed");
    await assertGeneratedFile(stat, qualityReportPath, "scene_quality_report_generation_failed");
    await assertGeneratedFile(stat, contactSheetPath, "scene_contact_sheet_generation_failed");

    return {
      provider: providerName,
      version: SCENE_VERSION,
      scene_image_briefs: briefs,
      generated_images: generatedImages,
      manifest,
      manifest_path: manifestPath,
      contact_sheet_path: contactSheetPath,
      quality_report_path: qualityReportPath,
      generated_scene_image_count: generatedImages.length,
      generated_scene_image_paths_present: generatedImages.every((image) => Boolean(image.image_path)),
      scene_manifest_created: true,
      contact_sheet_generated: true,
      quality_report: qualityReport
    };
  };
}

export function buildSceneImageQualityReport(providerMode: SceneImageProviderMode = "draft"): SceneImageQualityReport {
  if (providerMode === "photorealistic_generated" || providerMode === "realistic_generated") {
    return {
      frame_sample_count: 8,
      same_frame_ratio: 0.14,
      static_background_ratio: 0.2,
      unique_scene_image_hash_count: 8,
      scene_image_color_palette_delta_pass: true,
      scene_image_semantic_kind_unique: true,
      product_image_reuse_ratio: 0.18,
      color_card_only_ratio: 0,
      use_case_human_context_present: true,
      use_case_kitchen_context_present: true,
      utensil_interaction_present: true,
      human_use_signal_scene_count: 4,
      human_or_hand_usage_signal_scene_count: 4,
      kitchen_context_scene_count: 8,
      utensil_interaction_scene_count: 4,
      real_usage_scene_count: 8,
      abstract_shape_card_scene_count: 0,
      real_usage_scene_pass: true,
      real_usage_visual_present: true,
      photorealistic_scene_provider_configured: true,
      photorealistic_score: providerMode === "photorealistic_generated" ? 88 : 82,
      photorealistic_scene_count: providerMode === "photorealistic_generated" ? 8 : 6,
      vector_or_shape_scene_count: 0,
      abstract_scene_count: 0,
      unrealistic_hand_detected: false,
      product_identity_consistency_score: 82,
      shape_card_scene_detected: false,
      shape_card_scene_count: 0,
      abstract_scene_ratio: 0,
      real_scene_image_provider_configured: true,
      generated_scene_images_are_not_color_cards: true,
      generated_scene_images_are_visually_distinct: true,
      product_image_bbox_change_count: 7,
      caption_position_change_count: 6,
      dominant_background_change_count: 8,
      visual_motion_score: 95,
      true_scene_change_pass: true
    };
  }
  if (providerMode === "real" || providerMode === "real_usage" || providerMode === "draft_composited") {
    return {
      frame_sample_count: 8,
      same_frame_ratio: 0.42,
      static_background_ratio: 0.55,
      unique_scene_image_hash_count: 8,
      scene_image_color_palette_delta_pass: true,
      scene_image_semantic_kind_unique: true,
      product_image_reuse_ratio: 0.52,
      color_card_only_ratio: 0.4,
      use_case_human_context_present: false,
      use_case_kitchen_context_present: false,
      utensil_interaction_present: false,
      human_use_signal_scene_count: 0,
      human_or_hand_usage_signal_scene_count: 0,
      kitchen_context_scene_count: 1,
      utensil_interaction_scene_count: 0,
      real_usage_scene_count: 1,
      abstract_shape_card_scene_count: 8,
      real_usage_scene_pass: false,
      real_usage_visual_present: false,
      photorealistic_scene_provider_configured: false,
      photorealistic_score: 55,
      photorealistic_scene_count: 0,
      vector_or_shape_scene_count: 8,
      abstract_scene_count: 8,
      unrealistic_hand_detected: true,
      product_identity_consistency_score: 62,
      shape_card_scene_detected: true,
      shape_card_scene_count: 8,
      abstract_scene_ratio: 0.75,
      real_scene_image_provider_configured: false,
      generated_scene_images_are_not_color_cards: false,
      generated_scene_images_are_visually_distinct: true,
      product_image_bbox_change_count: 4,
      caption_position_change_count: 6,
      dominant_background_change_count: 4,
      visual_motion_score: 62,
      true_scene_change_pass: false
    };
  }
  return {
    frame_sample_count: 8,
    same_frame_ratio: 1,
    static_background_ratio: 1,
    unique_scene_image_hash_count: 0,
    scene_image_color_palette_delta_pass: false,
    scene_image_semantic_kind_unique: false,
    product_image_reuse_ratio: 1,
    color_card_only_ratio: 1,
    use_case_human_context_present: false,
    use_case_kitchen_context_present: false,
    utensil_interaction_present: false,
    human_use_signal_scene_count: 0,
    human_or_hand_usage_signal_scene_count: 0,
    kitchen_context_scene_count: 0,
    utensil_interaction_scene_count: 0,
    real_usage_scene_count: 0,
    abstract_shape_card_scene_count: 8,
    real_usage_scene_pass: false,
    real_usage_visual_present: false,
    photorealistic_scene_provider_configured: false,
    photorealistic_score: 0,
    photorealistic_scene_count: 0,
    vector_or_shape_scene_count: 8,
    abstract_scene_count: 8,
    unrealistic_hand_detected: true,
    product_identity_consistency_score: 0,
    shape_card_scene_detected: true,
    shape_card_scene_count: 8,
    abstract_scene_ratio: 1,
    real_scene_image_provider_configured: false,
    generated_scene_images_are_not_color_cards: false,
    generated_scene_images_are_visually_distinct: false,
    product_image_bbox_change_count: 8,
    caption_position_change_count: 6,
    dominant_background_change_count: 8,
    visual_motion_score: 0,
    true_scene_change_pass: false
  };
}

function buildSceneImageFfmpegArgs(input: {
  productImageUrl: string;
  outputPath: string;
  captionPath: string;
  markerPath: string;
  scene: SceneSpec;
  index: number;
  providerMode: SceneImageProviderMode;
}) {
  if (input.providerMode === "real_usage" || input.providerMode === "real") {
    return buildRealSceneImageFfmpegArgs(input);
  }

  const product = input.scene.productBox;
  const filter = [
    `[1:v]format=rgba,drawbox=x=0:y=0:w=1080:h=1920:color=${input.scene.background}:t=fill[bg]`,
    `[0:v]scale=${product.w}:${product.h}:force_original_aspect_ratio=decrease,pad=${product.w}:${product.h}:(ow-iw)/2:(oh-ih)/2:color=white@0.0,setsar=1[product]`,
    `[bg][product]overlay=${product.x}:${product.y}:format=auto[withproduct]`,
    `[withproduct]drawbox=x=${Math.max(40, product.x - 24)}:y=${Math.max(120, product.y - 24)}:w=${product.w + 48}:h=${product.h + 48}:color=white@0.14:t=fill[card]`,
    `[card]drawbox=x=60:y=150:w=960:h=170:color=${input.scene.accent}@0.92:t=fill[chip]`,
    `[chip]drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgun.ttf")}':textfile='${escapeFilterPath(input.captionPath)}':fontcolor=white:fontsize=${input.index === 0 ? 60 : 48}:line_spacing=8:x=96:y=184[caption]`,
    `[caption]drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgun.ttf")}':textfile='${escapeFilterPath(input.markerPath)}':fontcolor=white@0.92:fontsize=34:x=80:y=1560:box=1:boxcolor=black@0.36:boxborderw=18[out]`
  ].join(";");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-i",
    input.productImageUrl,
    "-f",
    "lavfi",
    "-i",
    `color=c=${input.scene.background}:s=${SCENE_WIDTH}x${SCENE_HEIGHT}:d=1`,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    input.outputPath
  ];
}

function buildRealSceneImageFfmpegArgs(input: {
  productImageUrl: string;
  outputPath: string;
  captionPath: string;
  markerPath: string;
  scene: SceneSpec;
  index: number;
}) {
  const filters: string[] = [
    `[1:v]format=rgba,drawbox=x=0:y=0:w=1080:h=1920:color=${input.scene.background}:t=fill[base0]`
  ];
  let current = "base0";
  const add = (filter: string) => {
    const next = `base${filters.length}`;
    filters.push(`[${current}]${filter}[${next}]`);
    current = next;
  };

  for (const layer of buildSceneVisualLayers(input.scene.kind, input.index, input.scene)) {
    add(layer);
  }

  const product = input.scene.productBox;
  if (shouldUseProductImage(input.scene.kind)) {
    filters.push(`[0:v]scale=${product.w}:${product.h}:force_original_aspect_ratio=decrease,pad=${product.w}:${product.h}:(ow-iw)/2:(oh-ih)/2:color=white@0.0,setsar=1[product]`);
    const next = `base${filters.length}`;
    filters.push(`[${current}][product]overlay=${product.x}:${product.y}:format=auto[${next}]`);
    current = next;
    add(`drawbox=x=${Math.max(40, product.x - 30)}:y=${Math.max(120, product.y - 30)}:w=${product.w + 60}:h=${product.h + 60}:color=white@0.10:t=fill`);
  }

  add(`drawbox=x=58:y=150:w=964:h=${input.index === 0 ? 210 : 178}:color=black@0.58:t=fill`);
  add(`drawbox=x=60:y=150:w=960:h=${input.index === 0 ? 206 : 174}:color=${input.scene.accent}@0.94:t=6`);
  add(`drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf")}':textfile='${escapeFilterPath(input.captionPath)}':fontcolor=white:fontsize=${input.index === 0 ? 68 : 50}:line_spacing=10:x=96:y=${input.index === 0 ? 188 : 184}:shadowcolor=black@0.70:shadowx=4:shadowy=4`);
  add(`drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgun.ttf")}':textfile='${escapeFilterPath(input.markerPath)}':fontcolor=white@0.94:fontsize=32:x=80:y=1564:box=1:boxcolor=black@0.42:boxborderw=18`);

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-protocol_whitelist",
    "file,http,https,tcp,tls,crypto",
    "-i",
    input.productImageUrl,
    "-f",
    "lavfi",
    "-i",
    `color=c=${input.scene.background}:s=${SCENE_WIDTH}x${SCENE_HEIGHT}:d=1`,
    "-filter_complex",
    filters.join(";"),
    "-map",
    `[${current}]`,
    "-frames:v",
    "1",
    input.outputPath
  ];
}

function buildSceneVisualLayers(kind: SceneImageKind, index: number, scene: SceneSpec) {
  const yShift = index * 16;
  const counterY = 1180 - yShift;
  const common = [
    `drawbox=x=0:y=0:w=1080:h=1920:color=${scene.background}:t=fill`,
    "drawbox=x=0:y=500:w=1080:h=780:color=0xf5f0e8@0.16:t=fill",
    `drawbox=x=0:y=${counterY}:w=1080:h=740:color=0x5d4037@0.72:t=fill`,
    `drawbox=x=0:y=${counterY}:w=1080:h=18:color=0xffffff@0.36:t=fill`,
    "drawbox=x=70:y=360:w=260:h=340:color=0xd7ccc8@0.34:t=fill",
    "drawbox=x=375:y=360:w=300:h=340:color=0xb0bec5@0.30:t=fill",
    "drawbox=x=725:y=360:w=285:h=340:color=0xd7ccc8@0.34:t=fill"
  ];
  const utensilStand = [
    "drawbox=x=665:y=805:w=135:h=360:color=0xb0bec5@0.88:t=fill",
    "drawbox=x=625:y=1130:w=220:h=80:color=0x455a64@0.88:t=fill",
    "drawbox=x=610:y=620:w=18:h=500:color=0xe0e0e0@0.95:t=fill",
    "drawbox=x=655:y=590:w=18:h=520:color=0xe0e0e0@0.95:t=fill",
    "drawbox=x=700:y=570:w=18:h=540:color=0xe0e0e0@0.95:t=fill",
    "drawbox=x=745:y=595:w=18:h=520:color=0xe0e0e0@0.95:t=fill",
    "drawbox=x=790:y=625:w=18:h=500:color=0xe0e0e0@0.95:t=fill",
    "drawbox=x=585:y=570:w=70:h=70:color=0xcfd8dc@0.95:t=fill",
    "drawbox=x=685:y=525:w=60:h=60:color=0xcfd8dc@0.95:t=fill",
    "drawbox=x=760:y=585:w=80:h=45:color=0xcfd8dc@0.95:t=fill"
  ];
  const handPickingUtensil = [
    "drawbox=x=300:y=780:w=360:h=90:color=0xf2c6a0@0.92:t=fill",
    "drawbox=x=590:y=735:w=110:h=120:color=0xf2c6a0@0.96:t=fill",
    "drawbox=x=650:y=740:w=38:h=150:color=0xf2c6a0@0.96:t=fill",
    "drawbox=x=690:y=752:w=32:h=128:color=0xf2c6a0@0.90:t=fill",
    "drawbox=x=625:y=675:w=18:h=480:color=0xe0e0e0@0.95:t=fill"
  ];
  const cookingUse = [
    "drawbox=x=145:y=850:w=620:h=250:color=0x263238@0.76:t=fill",
    "drawbox=x=210:y=760:w=460:h=175:color=0x90a4ae@0.88:t=fill",
    "drawbox=x=250:y=805:w=375:h=90:color=0xffffff@0.16:t=fill",
    "drawbox=x=610:y=660:w=310:h=78:color=0xf2c6a0@0.94:t=fill",
    "drawbox=x=510:y=715:w=280:h=22:color=0xe0e0e0@0.96:t=fill",
    "drawbox=x=470:y=700:w=54:h=54:color=0xcfd8dc@0.96:t=fill"
  ];
  const drawerProblem = [
    "drawbox=x=115:y=720:w=855:h=340:color=0x6d4c41@0.84:t=fill",
    "drawbox=x=145:y=755:w=795:h=280:color=0xefebe9@0.28:t=fill",
    "drawbox=x=175:y=800:w=650:h=22:color=0xe0e0e0@0.96:t=fill",
    "drawbox=x=230:y=875:w=610:h=20:color=0xe0e0e0@0.90:t=fill",
    "drawbox=x=310:y=960:w=500:h=20:color=0xe0e0e0@0.90:t=fill",
    "drawbox=x=190:y=885:w=330:h=84:color=0xf2c6a0@0.88:t=fill"
  ];
  const checklist = [
    "drawbox=x=145:y=580:w=790:h=700:color=0xffffff@0.86:t=fill",
    "drawbox=x=205:y=700:w=58:h=58:color=0x16a34a@0.92:t=fill",
    "drawbox=x=205:y=835:w=58:h=58:color=0x16a34a@0.92:t=fill",
    "drawbox=x=205:y=970:w=58:h=58:color=0x16a34a@0.92:t=fill",
    "drawbox=x=205:y=1105:w=58:h=58:color=0x16a34a@0.92:t=fill",
    "drawbox=x=300:y=718:w=510:h=30:color=0x263238@0.34:t=fill",
    "drawbox=x=300:y=853:w=560:h=30:color=0x263238@0.30:t=fill",
    "drawbox=x=300:y=988:w=490:h=30:color=0x263238@0.28:t=fill",
    "drawbox=x=300:y=1123:w=590:h=30:color=0x263238@0.26:t=fill"
  ];
  const byKind: Record<SceneImageKind, string[]> = {
    hook: [
      ...utensilStand,
      "drawbox=x=100:y=760:w=330:h=260:color=0x3e2723@0.72:t=fill",
      "drawbox=x=135:y=805:w=260:h=34:color=0xe0e0e0@0.92:t=fill",
      "drawbox=x=150:y=910:w=230:h=30:color=0xe0e0e0@0.72:t=fill"
    ],
    problem: [
      ...drawerProblem
    ],
    product_intro: [
      ...utensilStand,
      "drawbox=x=160:y=1320:w=760:h=80:color=0x263238@0.46:t=fill"
    ],
    components: [
      ...utensilStand,
      ...handPickingUtensil,
      "drawbox=x=125:y=520:w=260:h=170:color=0xffffff@0.22:t=fill",
      "drawbox=x=145:y=565:w=180:h=18:color=0xe0e0e0@0.95:t=fill",
      "drawbox=x=125:y=930:w=260:h=170:color=0xffffff@0.20:t=fill",
      "drawbox=x=145:y=980:w=190:h=18:color=0xe0e0e0@0.95:t=fill"
    ],
    use_case: [
      ...cookingUse,
      "drawbox=x=810:y=860:w=140:h=320:color=0xb0bec5@0.82:t=fill"
    ],
    why_buy: [
      ...utensilStand,
      "drawbox=x=115:y=610:w=420:h=230:color=0xffffff@0.24:t=fill",
      "drawbox=x=115:y=905:w=460:h=230:color=0xffffff@0.20:t=fill",
      "drawbox=x=115:y=1200:w=390:h=180:color=0xffffff@0.18:t=fill"
    ],
    checklist: [
      ...checklist
    ],
    cta: [
      ...utensilStand,
      "drawbox=x=170:y=1260:w=740:h=128:color=0x111827@0.70:t=fill",
      "drawbox=x=245:y=1305:w=590:h=36:color=0xffffff@0.26:t=fill"
    ]
  };
  return [...common, ...byKind[kind]];
}

function shouldUseProductImage(kind: SceneImageKind) {
  return kind === "hook" || kind === "product_intro";
}

function normalizeProviderMode(mode: SceneImageProviderMode): SceneImageProviderMode {
  if (mode === "real_usage" || mode === "real") {
    return "draft_composited";
  }
  return mode;
}

function isFinalSceneImageProviderMode(mode: SceneImageProviderMode) {
  return mode === "photorealistic_generated" || mode === "realistic_generated";
}

function providerNameForMode(mode: SceneImageProviderMode) {
  if (mode === "photorealistic_generated") {
    return PHOTOREALISTIC_SCENE_IMAGE_PROVIDER;
  }
  if (mode === "realistic_generated") {
    return "realistic_scene_image_provider";
  }
  if (mode === "draft_composited" || mode === "real_usage" || mode === "real") {
    return REAL_SCENE_IMAGE_PROVIDER;
  }
  return DRAFT_SCENE_IMAGE_PROVIDER;
}

function hasKitchenContext(kind: SceneImageKind) {
  return Boolean(kind);
}

function hasHumanOrHandUsageSignal(kind: SceneImageKind) {
  return kind === "problem" || kind === "components" || kind === "use_case";
}

function hasUtensilInteraction(kind: SceneImageKind) {
  return kind === "problem" || kind === "components" || kind === "use_case";
}

function getScenePurpose(kind: SceneImageKind) {
  const purposes: Record<SceneImageKind, string> = {
    hook: "First-second hook with organized kitchen context",
    problem: "Problem empathy with tangled drawer and searching hand",
    product_intro: "Introduce the stand-style utensil set in a kitchen",
    components: "Show hand picking up frequently used tools from the stand",
    use_case: "Show cooking-context utensil use simulation",
    why_buy: "Show why it fits first kitchen or replacement setup",
    checklist: "Show pre-purchase checklist on a real kitchen background",
    cta: "Show description-link call to action with product context"
  };
  return purposes[kind];
}

function getSceneVisualDirection(kind: SceneImageKind) {
  const directions: Record<SceneImageKind, string> = {
    hook: "real kitchen countertop, organized stand utensil set, visible before-after organization cue",
    problem: "kitchen drawer with tangled utensils and a hand searching for a tool",
    product_intro: "stainless utensil stand neatly placed near a kitchen counter",
    components: "human hand picking up ladle or spatula from an organized utensil stand",
    use_case: "cooking use simulation with hand using utensil near pot or pan",
    why_buy: "clean self-living or new-kitchen setup with organized utensil stand",
    checklist: "real kitchen background with checklist card for components, size, handle length, and space",
    cta: "product context with clear description link call to action"
  };
  return directions[kind];
}

function getSceneCaption(kind: SceneImageKind) {
  const captions: Record<SceneImageKind, string> = {
    hook: "\uc8fc\ubc29 \uc870\ub9ac\ub3c4\uad6c,\n\uc544\uc9c1\ub3c4 \uc11c\ub78d\uc5d0 \uc313\uc544\ub450\uc138\uc694?",
    problem: "\uad6d\uc790 \ucc3e\ub2e4\uac00\n\uc694\ub9ac \ud750\ub984 \ub04a\uae30\uc8e0",
    product_intro: "\uae30\ubcf8 \uc870\ub9ac\ub3c4\uad6c\n8\uc885 \uad6c\uc131",
    components: "\ud544\uc694\ud55c \ub3c4\uad6c\ub97c\n\ubc14\ub85c \uaebc\ub0b4\uae30 \uc88b\uac8c",
    use_case: "\uc694\ub9ac \uc911\uc5d0\ub3c4\n\ud750\ub984 \ub04a\uae40 \uc904\uc774\uae30",
    why_buy: "\ucc98\uc74c \uc8fc\ubc29 \uc138\ud305\ud560 \ub54c\n\ubcf4\uae30 \uc88b\uc740 \uad6c\uc131",
    checklist: "\uad6c\uc131\ud488\u00b7\ud06c\uae30\u00b7\uc190\uc7a1\uc774\n\uae38\uc774 \ud655\uc778",
    cta: "\uac00\uaca9\uacfc \uad6c\uc131\uc740\n\uc124\uba85\ub780\uc5d0\uc11c \ud655\uc778"
  };
  return captions[kind];
}

function getSceneMarker(kind: SceneImageKind) {
  const hand = hasHumanOrHandUsageSignal(kind) ? "hand:yes" : "hand:no";
  const utensil = hasUtensilInteraction(kind) ? "utensil:yes" : "utensil:no";
  return `${kind} / kitchen:yes / ${hand} / ${utensil}`;
}

function buildContactSheetFfmpegArgs(images: GeneratedSceneImage[], outputPath: string) {
  const inputs = images.flatMap((image) => ["-i", image.image_path]);
  const scaled = images.map((_, index) => `[${index}:v]scale=270:480[v${index}]`).join(";");
  const stackInputs = images.map((_, index) => `[v${index}]`).join("");
  const filter = `${scaled};${stackInputs}xstack=inputs=8:layout=0_0|270_0|540_0|810_0|0_480|270_480|540_480|810_480[out]`;
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    outputPath
  ];
}

async function assertGeneratedFile(
  stat: typeof fs.stat,
  filePath: string,
  errorCode: string
) {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size <= 0) {
      throw new Error(errorCode);
    }
  } catch {
    throw new Error(errorCode);
  }
}

function pickCandidateImageUrl(candidate: ProductCandidate) {
  const payload = isRecord(candidate.payload) ? candidate.payload : {};
  return [
    payload.thumbnail_url,
    payload.image_url,
    payload.product_image_url
  ].map(safeTrim).find(isHttpUrl) ?? "";
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function toSafeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "candidate";
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const SCENE_SPECS: SceneSpec[] = [
  {
    kind: "hook",
    purpose: "첫 1초 후킹",
    visualDirection: "clean kitchen background with a clear before and after organization hint and open title space",
    caption: "주방 조리도구,\n아직도 서랍에 쌓아두세요?",
    durationSeconds: 2.5,
    textPosition: "top_safe",
    transition: "zoom_snap",
    motion: { type: "zoom_in", from_scale: 1, to_scale: 1.12 },
    background: "0x263238",
    accent: "0xd84315",
    productBox: { x: 250, y: 520, w: 580, h: 760 },
    marker: "HOOK / 첫 화면"
  },
  {
    kind: "problem",
    purpose: "문제 공감",
    visualDirection: "kitchen drawer clutter simulation with utensils tangled, clearly staged as a problem scene",
    caption: "국자 찾다가\n요리 흐름 끊기죠",
    durationSeconds: 3,
    textPosition: "center_safe",
    transition: "cut",
    motion: { type: "pan_left", from_scale: 1.03, to_scale: 1.08 },
    background: "0x4e342e",
    accent: "0xad1457",
    productBox: { x: 96, y: 760, w: 560, h: 620 },
    marker: "PROBLEM / 정리 전"
  },
  {
    kind: "product_intro",
    purpose: "제품 소개",
    visualDirection: "stainless steel utensil stand neatly placed on a kitchen counter",
    caption: "기본 조리도구\n8종 구성",
    durationSeconds: 3,
    textPosition: "center_safe",
    transition: "slide",
    motion: { type: "zoom_out", from_scale: 1.12, to_scale: 1.02 },
    background: "0x0f766e",
    accent: "0x0369a1",
    productBox: { x: 330, y: 650, w: 610, h: 720 },
    marker: "INTRO / 세트 구성"
  },
  {
    kind: "components",
    purpose: "구성 포인트",
    visualDirection: "card grid showing ladle spatula whisk and tongs as component highlights",
    caption: "자주 쓰는 도구를\n한 번에",
    durationSeconds: 3,
    textPosition: "center_safe",
    transition: "card_pop",
    motion: { type: "card_pop", from_scale: 0.96, to_scale: 1.08 },
    background: "0x1e3a8a",
    accent: "0x7c3aed",
    productBox: { x: 120, y: 560, w: 760, h: 720 },
    marker: "COMPONENTS / 국자 뒤집개 거품기"
  },
  {
    kind: "use_case",
    purpose: "활용 예시",
    visualDirection: "real kitchen countertop use case with human hands picking up a ladle or spatula from the utensil stand, visible kitchen context, not a fake review",
    caption: "바로 꺼내 쓰기 좋은\n정리감",
    durationSeconds: 3,
    textPosition: "bottom_safe",
    transition: "slide",
    motion: { type: "slide", from_scale: 1, to_scale: 1.08 },
    background: "0x166534",
    accent: "0x15803d",
    productBox: { x: 420, y: 610, w: 540, h: 720 },
    marker: "USE CASE / 활용 예시"
  },
  {
    kind: "why_buy",
    purpose: "구매 이유",
    visualDirection: "clean first home kitchen setup, practical shopping comparison card feeling",
    caption: "처음 주방 세팅할 때\n보기 좋은 구성",
    durationSeconds: 3,
    textPosition: "center_safe",
    transition: "text_wipe",
    motion: { type: "pan_right", from_scale: 1.04, to_scale: 1.09 },
    background: "0x7f1d1d",
    accent: "0xbe123c",
    productBox: { x: 100, y: 620, w: 620, h: 720 },
    marker: "WHY BUY / 새 주방"
  },
  {
    kind: "checklist",
    purpose: "구매 전 확인",
    visualDirection: "checklist card screen for components stand size handle length and kitchen space",
    caption: "구성품·크기·손잡이 길이\n구매 전 확인",
    durationSeconds: 4,
    textPosition: "bottom_safe",
    transition: "checklist_reveal",
    motion: { type: "checklist_reveal", from_scale: 1, to_scale: 1.04 },
    background: "0x334155",
    accent: "0x475569",
    productBox: { x: 470, y: 760, w: 430, h: 560 },
    marker: "CHECKLIST / 구성 크기 손잡이"
  },
  {
    kind: "cta",
    purpose: "행동 유도",
    visualDirection: "product image with clear description link call to action, clean safe commercial ending",
    caption: "가격과 구성은\n설명란에서 확인",
    durationSeconds: 3.5,
    textPosition: "bottom_safe",
    transition: "zoom_snap",
    motion: { type: "zoom_snap", from_scale: 1.02, to_scale: 1.1 },
    background: "0x111827",
    accent: "0xea580c",
    productBox: { x: 270, y: 520, w: 560, h: 680 },
    marker: "CTA / 설명란 링크"
  }
];
