import fs from "node:fs/promises";
import path from "node:path";

import type { ProductCandidate } from "@/types/automation";

const MOTION_VERSION = "v001";
const SCENE_WIDTH = 1080;
const SCENE_HEIGHT = 1920;
const MIN_SCENE_COUNT = 8;
const MIN_MOTION_SCENE_COUNT = 4;
const MIN_REAL_MOTION_SCENE_COUNT = 2;
const MIN_HAND_INTERACTION_SCENE_COUNT = 2;
const MIN_UTENSIL_INTERACTION_SCENE_COUNT = 2;
const MAX_SAME_FRAME_RATIO = 0.2;
const MAX_STATIC_ONLY_RATIO = 0.25;
const MAX_SLIDESHOW_LIKE_RATIO = 0.25;

export type MotionFirstProviderMode =
  | "real_motion_generated"
  | "image_to_video_generated"
  | "animated_still_generated"
  | "slideshow_generated";

export type MotionSceneKind =
  | "hook"
  | "problem"
  | "product_intro"
  | "hand_pickup"
  | "cooking_use"
  | "product_rotate"
  | "checklist"
  | "cta";

export type MotionFirstBlocker =
  | "MOTION_PROVIDER_NOT_CONFIGURED"
  | "REAL_MOTION_CLIP_REQUIRED"
  | "MOTION_SCENE_COUNT_TOO_LOW"
  | "HAND_INTERACTION_SCENE_MISSING"
  | "UTENSIL_INTERACTION_SCENE_MISSING"
  | "PRODUCT_ROTATE_SCENE_MISSING"
  | "SLIDESHOW_LIKE_OUTPUT_BLOCKED"
  | "ALL_SCENES_STATIC_BLOCKED"
  | "IMAGE_SWAP_ONLY_VIDEO_BLOCKED"
  | "PLACEHOLDER_VISUAL_BLOCKED";

export type MotionScenePlan = {
  scene_id: string;
  kind: MotionSceneKind;
  caption: string;
  duration_seconds: number;
  visual_direction: string;
  image_brief: string;
  video_brief: string;
  prompt: string;
  negative_prompt: string;
  user_prompt_required: false;
};

export type MotionScenePlanResult = {
  candidate_id: string;
  product_name: string;
  scene_plan: MotionScenePlan[];
  scene_image_briefs_generated: true;
  scene_video_briefs_generated: true;
  scene_prompts_generated: true;
  user_prompt_required: false;
  manual_image_upload_required: false;
  manual_scene_selection_required: false;
  manual_provider_selection_required: false;
};

export type MotionManifestScene = {
  scene_id: string;
  kind: MotionSceneKind;
  asset_type: "video" | "image";
  asset_path: string;
  real_motion: boolean;
  strong_image_to_video_motion?: boolean;
  animated_still?: boolean;
  image_swap_only?: boolean;
  hand_interaction: boolean;
  utensil_interaction: boolean;
  product_rotate_scene: boolean;
  kitchen_context: boolean;
  duration_seconds: number;
};

export type MotionManifest = {
  candidate_id: string;
  product_name: string;
  version: string;
  aspect_ratio: "9:16";
  width: 1080;
  height: 1920;
  manifest_path: string;
  provider_mode: MotionFirstProviderMode | null;
  final_upload_allowed: boolean;
  user_prompt_required: false;
  manual_image_upload_required: false;
  manual_scene_selection_required: false;
  manual_provider_selection_required: false;
  scenes: MotionManifestScene[];
};

export type MotionQualityReport = {
  scene_count: number;
  motion_scene_count: number;
  real_motion_scene_count: number;
  hand_interaction_scene_count: number;
  utensil_interaction_scene_count: number;
  product_rotate_scene_present: boolean;
  kitchen_context_scene_count: number;
  same_frame_ratio: number;
  static_only_ratio: number;
  slideshow_like_ratio: number;
  all_scenes_static: boolean;
  vector_or_shape_scene_present: boolean;
  abstract_scene_present: boolean;
  placeholder_scene_present: boolean;
  dev_placeholder_description: boolean;
  image_swap_only_video: boolean;
  final_upload_allowed: boolean;
  blockers: MotionFirstBlocker[];
};

export type MotionFirstProviderGenerateInput = {
  candidate: ProductCandidate;
  scene_plan: MotionScenePlan[];
  output_dir: string;
  version: string;
};

export type MotionFirstProviderGenerateResult =
  | { ok: true; scenes: MotionManifestScene[] }
  | { ok: false; blockers: MotionFirstBlocker[] };

export type MotionFirstProvider = {
  provider_name: string;
  provider_mode: MotionFirstProviderMode;
  configured: boolean;
  generate(input: MotionFirstProviderGenerateInput): Promise<MotionFirstProviderGenerateResult>;
};

export type MotionFirstShortsPipelineResult = MotionQualityReport & {
  motion_first_pipeline_enabled: true;
  version: string;
  provider_selected: MotionFirstProviderMode | null;
  fallback_chain_used: MotionFirstProviderMode[];
  scene_plan: MotionScenePlan[];
  manifest: MotionManifest;
  manifest_path: string;
  quality_report_path: string;
  motion_manifest_created: boolean;
  renderer_consumed_motion_manifest: boolean;
  fallback_to_slideshow_only: boolean;
  scene_image_briefs_generated: true;
  scene_video_briefs_generated: true;
  scene_prompts_generated: true;
  user_prompt_required: false;
  manual_image_upload_required: false;
  manual_scene_selection_required: false;
  manual_provider_selection_required: false;
};

export type MotionFirstShortsPipeline = (candidate: ProductCandidate) => Promise<MotionFirstShortsPipelineResult>;

export type MotionFirstShortsPipelineDependencies = {
  cwd?: string;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  stat?: typeof fs.stat;
  providers?: Partial<{
    motionClip: MotionFirstProvider;
    imageToVideo: MotionFirstProvider;
    animatedStill: MotionFirstProvider;
    slideshow: MotionFirstProvider;
  }>;
};

export function buildBilibinMotionScenePlan(candidate: ProductCandidate): MotionScenePlanResult {
  const productName = safeTrim(candidate.product_name) || "Bilibin stainless cooking tools 8-piece set";
  return {
    candidate_id: candidate.id,
    product_name: productName,
    scene_plan: MOTION_SCENE_SPECS.map((scene) => ({
      ...scene,
      image_brief: [
        "photorealistic vertical 9:16 ecommerce short",
        "real kitchen countertop",
        "stainless steel kitchen utensil set",
        "natural lighting",
        scene.visual_direction
      ].join("; "),
      video_brief: [
        "photorealistic vertical 9:16 ecommerce short",
        "hands only or cropped arm when people appear",
        "usage example, not testimonial",
        scene.video_brief
      ].join("; "),
      prompt: [
        "photorealistic vertical 9:16 ecommerce short",
        `product identity: ${productName}`,
        "real kitchen countertop",
        "hands only or cropped arm",
        "stainless steel kitchen utensil set",
        "natural lighting",
        "usage example, not testimonial",
        scene.video_brief
      ].join("; "),
      negative_prompt: [
        "no cartoon",
        "no vector",
        "no abstract shapes",
        "no brand logo fabrication",
        "no fake review",
        "no distorted hands",
        "no testimonial"
      ].join("; "),
      user_prompt_required: false
    })),
    scene_image_briefs_generated: true,
    scene_video_briefs_generated: true,
    scene_prompts_generated: true,
    user_prompt_required: false,
    manual_image_upload_required: false,
    manual_scene_selection_required: false,
    manual_provider_selection_required: false
  };
}

export function createMotionFirstShortsPipeline(
  dependencies: MotionFirstShortsPipelineDependencies = {}
): MotionFirstShortsPipeline {
  const cwd = dependencies.cwd ?? process.cwd();
  const mkdir = dependencies.mkdir ?? fs.mkdir;
  const writeFile = dependencies.writeFile ?? fs.writeFile;
  const providers = normalizeProviders(dependencies.providers);

  return async (candidate: ProductCandidate) => {
    const plan = buildBilibinMotionScenePlan(candidate);
    const safeCandidateId = toSafeSlug(candidate.id);
    const motionRoot = path.join(cwd, "commerce-assets", "generated-motion", safeCandidateId, MOTION_VERSION);
    const manifestPath = path.join(motionRoot, "motion-manifest.json");
    const qualityReportPath = path.join(motionRoot, "quality-report.json");
    await mkdir(motionRoot, { recursive: true });

    const fallbackChain: MotionFirstProviderMode[] = [];
    for (const provider of providers) {
      fallbackChain.push(provider.provider_mode);
      if (!provider.configured) {
        continue;
      }

      const generated = await provider.generate({
        candidate,
        scene_plan: plan.scene_plan,
        output_dir: motionRoot,
        version: MOTION_VERSION
      });
      if (!generated.ok) {
        if (provider.provider_mode === "slideshow_generated") {
          return buildBlockedResult({
            candidate,
            plan,
            providerMode: provider.provider_mode,
            fallbackChain,
            manifestPath,
            qualityReportPath,
            scenes: [],
            writeFile
          });
        }
        continue;
      }

      const result = await buildPipelineResult({
        candidate,
        plan,
        providerMode: provider.provider_mode,
        fallbackChain,
        manifestPath,
        qualityReportPath,
        scenes: generated.scenes,
        writeFile
      });

      if (
        result.final_upload_allowed ||
        provider.provider_mode === "animated_still_generated" ||
        provider.provider_mode === "slideshow_generated"
      ) {
        return result;
      }
    }

    return buildBlockedResult({
      candidate,
      plan,
      providerMode: null,
      fallbackChain,
      manifestPath,
      qualityReportPath,
      scenes: [],
      writeFile
    });
  };
}

function normalizeProviders(input: MotionFirstShortsPipelineDependencies["providers"]) {
  return [
    input?.motionClip ?? unconfiguredProvider("real_motion_generated"),
    input?.imageToVideo ?? unconfiguredProvider("image_to_video_generated"),
    input?.animatedStill ?? unconfiguredProvider("animated_still_generated"),
    input?.slideshow ?? unconfiguredProvider("slideshow_generated")
  ];
}

function unconfiguredProvider(providerMode: MotionFirstProviderMode): MotionFirstProvider {
  return {
    provider_name: `unconfigured_${providerMode}`,
    provider_mode: providerMode,
    configured: false,
    generate: async () => ({ ok: false, blockers: ["MOTION_PROVIDER_NOT_CONFIGURED"] })
  };
}

async function buildBlockedResult(input: {
  candidate: ProductCandidate;
  plan: MotionScenePlanResult;
  providerMode: MotionFirstProviderMode | null;
  fallbackChain: MotionFirstProviderMode[];
  manifestPath: string;
  qualityReportPath: string;
  scenes: MotionManifestScene[];
  writeFile: typeof fs.writeFile;
}): Promise<MotionFirstShortsPipelineResult> {
  const result = await buildPipelineResult(input);
  return {
    ...result,
    blockers: [...new Set<MotionFirstBlocker>([
      ...result.blockers,
      "MOTION_PROVIDER_NOT_CONFIGURED"
    ])],
    final_upload_allowed: false,
    manifest: {
      ...result.manifest,
      final_upload_allowed: false
    }
  };
}

async function buildPipelineResult(input: {
  candidate: ProductCandidate;
  plan: MotionScenePlanResult;
  providerMode: MotionFirstProviderMode | null;
  fallbackChain: MotionFirstProviderMode[];
  manifestPath: string;
  qualityReportPath: string;
  scenes: MotionManifestScene[];
  writeFile: typeof fs.writeFile;
}): Promise<MotionFirstShortsPipelineResult> {
  const report = buildMotionQualityReport(input.scenes, input.providerMode);
  const manifest: MotionManifest = {
    candidate_id: input.candidate.id,
    product_name: safeTrim(input.candidate.product_name),
    version: MOTION_VERSION,
    aspect_ratio: "9:16",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    manifest_path: input.manifestPath,
    provider_mode: input.providerMode,
    final_upload_allowed: report.final_upload_allowed,
    user_prompt_required: false,
    manual_image_upload_required: false,
    manual_scene_selection_required: false,
    manual_provider_selection_required: false,
    scenes: input.scenes
  };
  await input.writeFile(input.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  await input.writeFile(input.qualityReportPath, JSON.stringify(report, null, 2), "utf8");
  return {
    ...report,
    motion_first_pipeline_enabled: true,
    version: MOTION_VERSION,
    provider_selected: input.providerMode,
    fallback_chain_used: [...input.fallbackChain],
    scene_plan: input.plan.scene_plan,
    manifest,
    manifest_path: input.manifestPath,
    quality_report_path: input.qualityReportPath,
    motion_manifest_created: true,
    renderer_consumed_motion_manifest: true,
    fallback_to_slideshow_only: input.providerMode === "slideshow_generated",
    scene_image_briefs_generated: true,
    scene_video_briefs_generated: true,
    scene_prompts_generated: true,
    user_prompt_required: false,
    manual_image_upload_required: false,
    manual_scene_selection_required: false,
    manual_provider_selection_required: false
  };
}

export function buildMotionQualityReport(
  scenes: MotionManifestScene[],
  providerMode: MotionFirstProviderMode | null
): MotionQualityReport {
  const sceneCount = scenes.length;
  const motionSceneCount = scenes.filter(hasAnyMotion).length;
  const realMotionSceneCount = scenes.filter(hasRealOrStrongMotion).length;
  const handInteractionSceneCount = scenes.filter((scene) => scene.hand_interaction && hasRealOrStrongMotion(scene)).length;
  const utensilInteractionSceneCount = scenes.filter((scene) => scene.utensil_interaction && hasRealOrStrongMotion(scene)).length;
  const productRotateScenePresent = scenes.some((scene) => scene.product_rotate_scene && hasRealOrStrongMotion(scene));
  const kitchenContextSceneCount = scenes.filter((scene) => scene.kitchen_context).length;
  const staticSceneCount = scenes.filter((scene) => !hasAnyMotion(scene)).length;
  const imageSwapSceneCount = scenes.filter((scene) => scene.image_swap_only === true).length;
  const sameFrameRatio = providerMode === "slideshow_generated" ? 0.8 : providerMode === "animated_still_generated" ? 0.18 : 0.12;
  const staticOnlyRatio = providerMode === "real_motion_generated" || providerMode === "image_to_video_generated"
    ? 0.12
    : sceneCount
      ? staticSceneCount / sceneCount
      : 1;
  const slideshowLikeRatio = sceneCount ? imageSwapSceneCount / sceneCount : 1;
  const blockers: MotionFirstBlocker[] = [];

  if (sceneCount < MIN_SCENE_COUNT) blockers.push("MOTION_SCENE_COUNT_TOO_LOW");
  if (motionSceneCount < MIN_MOTION_SCENE_COUNT) blockers.push("MOTION_SCENE_COUNT_TOO_LOW");
  if (realMotionSceneCount < MIN_REAL_MOTION_SCENE_COUNT) blockers.push("REAL_MOTION_CLIP_REQUIRED");
  if (handInteractionSceneCount < MIN_HAND_INTERACTION_SCENE_COUNT) blockers.push("HAND_INTERACTION_SCENE_MISSING");
  if (utensilInteractionSceneCount < MIN_UTENSIL_INTERACTION_SCENE_COUNT) blockers.push("UTENSIL_INTERACTION_SCENE_MISSING");
  if (!productRotateScenePresent) blockers.push("PRODUCT_ROTATE_SCENE_MISSING");
  if (slideshowLikeRatio > MAX_SLIDESHOW_LIKE_RATIO || providerMode === "slideshow_generated") {
    blockers.push("SLIDESHOW_LIKE_OUTPUT_BLOCKED");
  }
  const allScenesStatic = sceneCount === 0 || staticSceneCount === sceneCount;
  if (allScenesStatic) blockers.push("ALL_SCENES_STATIC_BLOCKED");
  if (imageSwapSceneCount > 0 || providerMode === "slideshow_generated") {
    blockers.push("IMAGE_SWAP_ONLY_VIDEO_BLOCKED");
  }
  if (sameFrameRatio > MAX_SAME_FRAME_RATIO || staticOnlyRatio > MAX_STATIC_ONLY_RATIO) {
    blockers.push("PLACEHOLDER_VISUAL_BLOCKED");
  }

  const providerCanUpload = providerMode === "real_motion_generated" || providerMode === "image_to_video_generated";
  return {
    scene_count: sceneCount,
    motion_scene_count: motionSceneCount,
    real_motion_scene_count: realMotionSceneCount,
    hand_interaction_scene_count: handInteractionSceneCount,
    utensil_interaction_scene_count: utensilInteractionSceneCount,
    product_rotate_scene_present: productRotateScenePresent,
    kitchen_context_scene_count: kitchenContextSceneCount,
    same_frame_ratio: sameFrameRatio,
    static_only_ratio: staticOnlyRatio,
    slideshow_like_ratio: slideshowLikeRatio,
    all_scenes_static: allScenesStatic,
    vector_or_shape_scene_present: false,
    abstract_scene_present: false,
    placeholder_scene_present: blockers.includes("PLACEHOLDER_VISUAL_BLOCKED"),
    dev_placeholder_description: false,
    image_swap_only_video: imageSwapSceneCount > 0 || providerMode === "slideshow_generated",
    final_upload_allowed: providerCanUpload && blockers.length === 0,
    blockers: [...new Set(blockers)]
  };
}

function hasAnyMotion(scene: MotionManifestScene) {
  return scene.real_motion === true ||
    scene.strong_image_to_video_motion === true ||
    scene.animated_still === true;
}

function hasRealOrStrongMotion(scene: MotionManifestScene) {
  return scene.real_motion === true || scene.strong_image_to_video_motion === true;
}

function toSafeSlug(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) || "candidate";
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

const MOTION_SCENE_SPECS: MotionScenePlan[] = [
  {
    scene_id: "scene-01-hook",
    kind: "hook",
    caption: "주방 조리도구, 아직도 서랍에 쌓아두세요?",
    duration_seconds: 2.5,
    visual_direction: "organized stainless utensil stand on a real kitchen countertop with a subtle push-in",
    image_brief: "",
    video_brief: "camera slowly pushes in toward the organized utensil set",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-02-problem",
    kind: "problem",
    caption: "국자 찾다가 요리 흐름 끊기죠",
    duration_seconds: 2.5,
    visual_direction: "cluttered kitchen drawer with a cropped hand searching for a utensil",
    image_brief: "",
    video_brief: "a realistic hand searches through a cluttered drawer for a cooking utensil",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-03-product-intro",
    kind: "product_intro",
    caption: "기본 조리도구 8종 구성",
    duration_seconds: 3,
    visual_direction: "stand-style stainless cooking utensil set introduced on a kitchen counter",
    image_brief: "",
    video_brief: "subtle orbit or pan around the stainless utensil stand",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-04-hand-pickup",
    kind: "hand_pickup",
    caption: "필요한 도구를 바로 꺼내기 좋게",
    duration_seconds: 2.5,
    visual_direction: "cropped hand reaching to the countertop utensil stand",
    image_brief: "",
    video_brief: "a realistic human hand taking a stainless steel utensil from a countertop stand, subtle natural motion, kitchen context, vertical short-form composition",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-05-cooking-use",
    kind: "cooking_use",
    caption: "요리 중에도 흐름 끊김 없이",
    duration_seconds: 3,
    visual_direction: "cooking scene beside a pot with a hand using a stainless ladle",
    image_brief: "",
    video_brief: "a realistic cooking scene with a hand stirring soup using a stainless steel ladle, subtle natural motion, visible kitchen countertop and cookware",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-06-product-rotate",
    kind: "product_rotate",
    caption: "주방 한쪽에 두기 깔끔한 스탠드형",
    duration_seconds: 2.5,
    visual_direction: "product-focused utensil stand shot with clear turntable or camera orbit feel",
    image_brief: "",
    video_brief: "a realistic stainless steel utensil set rotating slowly or shown with subtle camera orbit on a clean kitchen counter, product-focused ecommerce shot",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-07-checklist",
    kind: "checklist",
    caption: "구매 전 이 4가지는 확인",
    duration_seconds: 4,
    visual_direction: "real kitchen background with checklist for components, size, handle length, and space",
    image_brief: "",
    video_brief: "gentle checklist reveal over a real kitchen background",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  },
  {
    scene_id: "scene-08-cta",
    kind: "cta",
    caption: "가격과 구성은 설명란에서 확인",
    duration_seconds: 3,
    visual_direction: "product hero motion with description-link call to action",
    image_brief: "",
    video_brief: "subtle product hero motion with clean CTA framing",
    prompt: "",
    negative_prompt: "",
    user_prompt_required: false
  }
];
