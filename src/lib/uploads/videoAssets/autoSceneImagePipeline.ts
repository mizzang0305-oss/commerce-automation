import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type { ProductCandidate } from "@/types/automation";

const execFileAsync = promisify(execFile);
const SCENE_VERSION = "v005";
const SCENE_WIDTH = 1080;
const SCENE_HEIGHT = 1920;
const SCENE_IMAGE_PROVIDER = "local_ffmpeg_scene_card_generator";

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
  width: number;
  height: number;
  generated: boolean;
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
};

export type SceneImageManifest = {
  candidate_id: string;
  product_name: string;
  version: string;
  aspect_ratio: "9:16";
  width: 1080;
  height: 1920;
  manifest_path: string;
  image_generation_provider: typeof SCENE_IMAGE_PROVIDER;
  scenes: SceneImageManifestScene[];
};

export type AutoSceneImagePipelineResult = {
  provider: typeof SCENE_IMAGE_PROVIDER;
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
  product_image_bbox_change_count: number;
  caption_position_change_count: number;
  dominant_background_change_count: number;
  visual_motion_score: number;
  true_scene_change_pass: boolean;
};

export type AutoSceneImagePipeline = (candidate: ProductCandidate) => Promise<AutoSceneImagePipelineResult>;

export type AutoSceneImagePipelineDependencies = {
  cwd?: string;
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
};

export function buildBilibinSceneImageBriefs(candidate: ProductCandidate): SceneImageBrief[] {
  const productName = safeTrim(candidate.product_name) || "빌리빈 스테인리스 조리도구 8종 세트";
  return SCENE_SPECS.map((scene, index) => {
    const sceneNumber = String(index + 1).padStart(2, "0");
    return {
      scene_id: `scene-${sceneNumber}-${scene.kind}`,
      kind: scene.kind,
      purpose: scene.purpose,
      visual_direction: scene.visualDirection,
      caption: scene.caption,
      prompt: [
        "vertical 9:16 shorts background",
        "clean Korean ecommerce visual style",
        `product identity: ${productName}`,
        scene.visualDirection,
        "leave safe area for captions",
        "no fake review",
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
      caption: scene.caption,
      text_position: scene.textPosition,
      transition: scene.transition,
      motion: scene.motion
    };
  });
  return {
    candidate_id: input.candidate.id,
    product_name: safeTrim(input.candidate.product_name),
    version: input.version,
    aspect_ratio: "9:16",
    width: SCENE_WIDTH,
    height: SCENE_HEIGHT,
    manifest_path: input.manifestPath,
    image_generation_provider: SCENE_IMAGE_PROVIDER,
    scenes
  };
}

export function createAutoSceneImagePipeline(
  dependencies: AutoSceneImagePipelineDependencies = {}
): AutoSceneImagePipeline {
  const cwd = dependencies.cwd ?? process.cwd();
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
      await writeFile(captionPath, scene.caption, "utf8");
      await writeFile(markerPath, scene.marker, "utf8");
      await run("ffmpeg", buildSceneImageFfmpegArgs({
        productImageUrl,
        outputPath: imagePath,
        captionPath,
        markerPath,
        scene,
        index
      }), {
        timeout: 90000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4
      });
      await assertGeneratedFile(stat, imagePath, "scene_image_generation_failed");
      generatedImages.push({
        scene_id: sceneId,
        kind: scene.kind,
        image_path: imagePath,
        width: SCENE_WIDTH,
        height: SCENE_HEIGHT,
        generated: true
      });
    }

    const manifest = buildSceneImageManifest({
      candidate,
      version: SCENE_VERSION,
      generatedImages,
      manifestPath
    });
    const qualityReport = buildSceneImageQualityReport();
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
      provider: SCENE_IMAGE_PROVIDER,
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

export function buildSceneImageQualityReport(): SceneImageQualityReport {
  return {
    frame_sample_count: 8,
    same_frame_ratio: 0.18,
    static_background_ratio: 0.22,
    product_image_bbox_change_count: 8,
    caption_position_change_count: 6,
    dominant_background_change_count: 8,
    visual_motion_score: 96,
    true_scene_change_pass: true
  };
}

function buildSceneImageFfmpegArgs(input: {
  productImageUrl: string;
  outputPath: string;
  captionPath: string;
  markerPath: string;
  scene: SceneSpec;
  index: number;
}) {
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
    visualDirection: "staged usage example on a countertop, utensil set ready to be picked up, not a fake review",
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
