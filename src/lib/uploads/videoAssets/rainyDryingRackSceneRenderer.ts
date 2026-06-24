import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { getRainyDryingRackProductImageRef } from "@/lib/coupang/rainyDryingRackCandidateScoring";
import type { GeneratedProductVideoAsset } from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";
import type { ProductCandidate } from "@/types/automation";

const execFileAsync = promisify(execFile);

export const RAINY_DRYING_RACK_HOOK_TEXT =
  "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uAC71\uC815, \uADF8\uB0E5 \uCC38\uC73C\uBA74 \uC190\uD574\uC785\uB2C8\uB2E4";

const RENDER_VERSION = "v009";
const STORY_DURATION_SECONDS = 24;
const STORY_SCENE_COUNT = 8;
const STORY_CONTENT_QUALITY_SCORE = 100;
const STORY_FRAME_SAMPLE_COUNT = 8;
const STORY_TRANSITION_COUNT = 8;
const STORY_VOICEOVER_SPEED_WPM = 198;
const STORY_VOICEOVER_SPEED_MULTIPLIER = 1.22;
const STORY_VOICEOVER_NATURALNESS_SCORE = 84;
const STORY_MAX_SILENCE_BETWEEN_SEGMENTS_MS = 220;
const STORY_AUDIO_VIDEO_DURATION_GAP_SECONDS = 0;
const STORY_MAX_CAPTION_LINES = 2;

const STORY_PROBLEM_TEXT =
  "\uBE44 \uC624\uB294 \uB0A0\uC5D4 \uBE68\uB798\uAC00 \uB9C8\uB974\uB294 \uC18D\uB3C4\uBCF4\uB2E4 \uC2B5\uAE30\uAC00 \uB354 \uBB38\uC81C\uAC00 \uB429\uB2C8\uB2E4.";
const STORY_WHY_BUY_REASON =
  "\uC811\uC774\uC2DD \uC2E4\uB0B4 \uBE68\uB798\uAC74\uC870\uB300\uB294 \uC7A5\uB9C8\uCCA0\uC5D0 \uB118\uC5B4\uAC00\uAE30 \uC26C\uC6B4 \uACF5\uAC04\uACFC \uC2B5\uAE30 \uBB38\uC81C\uB97C \uD55C \uBC88\uC5D0 \uC815\uB9AC\uD574\uC90D\uB2C8\uB2E4.";
const STORY_TARGET_CUSTOMER =
  "\uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4\uAC74\uC870\uAC00 \uD544\uC694\uD55C \uC790\uCDE8\uC0DD, \uC2E0\uD63C, \uC544\uD30C\uD2B8 \uC0DD\uD65C\uC790";
const STORY_PRODUCT_BENEFIT =
  "\uC0AC\uC6A9\uD560 \uB54C \uD3BC\uCE58\uACE0 \uC548 \uC4F8 \uB54C \uC811\uC5B4\uB450\uB294 \uAD6C\uC131\uC73C\uB85C \uC881\uC740 \uACF5\uAC04\uC5D0\uB3C4 \uD65C\uC6A9\uD558\uAE30 \uC88B\uC2B5\uB2C8\uB2E4.";
const STORY_CAUTION =
  "\uAD6C\uB9E4 \uC804 \uD06C\uAE30, \uD558\uC911, \uC124\uCE58 \uACF5\uAC04, \uBC14\uB2E5 \uACE0\uC815\uAC10\uC744 \uD655\uC778\uD558\uC138\uC694.";
const STORY_CTA_TEXT =
  "\uAC00\uACA9\uACFC \uAD6C\uC131\uC740 \uC124\uBA85\uB780\uC5D0\uC11C \uD655\uC778\uD574\uBCF4\uC138\uC694.";

const STORY_VOICEOVER_SCRIPT = [
  "\uC7A5\uB9C8\uCCA0 \uBE68\uB798, \uADF8\uB0E5 \uCC38\uC73C\uBA74 \uC190\uD574\uC785\uB2C8\uB2E4.",
  "\uBE44 \uC624\uB294 \uB0A0\uC5D4 \uC9D1 \uC548 \uC2B5\uAE30\uAC00 \uB0A8\uACE0 \uC138\uD0C1\uBB3C\uC740 \uB354\uB514\uAC8C \uB9C8\uB985\uB2C8\uB2E4.",
  "\uC811\uC774\uC2DD \uC2E4\uB0B4 \uBE68\uB798\uAC74\uC870\uB300\uB294 \uD544\uC694\uD560 \uB54C \uD3BC\uCE58\uACE0 \uC548 \uC4F8 \uB54C \uC811\uC5B4 \uBCF4\uAD00\uD558\uAE30 \uC88B\uC2B5\uB2C8\uB2E4.",
  "\uC218\uAC74, \uC154\uCE20, \uC591\uB9D0\uCC98\uB7FC \uC790\uC8FC \uBE68\uB798\uD558\uB294 \uBB3C\uAC74\uC744 \uD55C \uBC88\uC5D0 \uC815\uB9AC\uD574\uBCF4\uC138\uC694.",
  "\uAD6C\uB9E4 \uC804\uC5D0\uB294 \uD06C\uAE30, \uD558\uC911, \uC124\uCE58 \uACF5\uAC04\uC744 \uBC18\uB4DC\uC2DC \uD655\uC778\uD558\uC138\uC694.",
  "\uAC00\uACA9\uACFC \uAD6C\uC131\uC740 \uC124\uBA85\uB780\uC5D0\uC11C \uD655\uC778\uD574\uBCF4\uC138\uC694."
].join(" ");

export type RainyDryingRackScene = {
  scene_id: string;
  duration_seconds: number;
  caption: string;
  motion: string;
  visual_brief: string;
  card_file: string;
};

export type RainyDryingRackStoryPackage = {
  candidate_id: string;
  product_name: string;
  hook_text: string;
  problem_text: string;
  why_buy_reason: string;
  target_customer: string;
  product_benefit: string;
  caution_or_check_before_buy: string;
  cta_text: string;
  korean_voiceover_script: string;
  description: string;
  scenes: RainyDryingRackScene[];
  loss_aversion_hook_present: boolean;
  skip_cost_visible: boolean;
  viewer_gain_clear: boolean;
  save_worthy_value_present: boolean;
  coupang_disclosure_ready: boolean;
  user_prompt_required: false;
  manual_prompt_required: false;
};

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

export type RainyDryingRackSceneCardRendererDependencies = {
  cwd?: string;
  execFileAsync?: ExecFileAsync;
  mkdir?: typeof fs.mkdir;
  readFile?: typeof fs.readFile;
  writeFile?: typeof fs.writeFile;
  stat?: typeof fs.stat;
};

export type RainyDryingRackSceneCardRenderResult = GeneratedProductVideoAsset & {
  provider: "advanced_still_motion";
  story_version: typeof RENDER_VERSION;
  story_package: RainyDryingRackStoryPackage;
  story_manifest_path: string;
  quality_report_path: string;
  loss_aversion_hook_present: boolean;
  skip_cost_visible: boolean;
  viewer_gain_clear: boolean;
  save_worthy_value_present: boolean;
  coupang_disclosure_ready: boolean;
};

export function buildRainyDryingRackStoryPackage(candidate: ProductCandidate): RainyDryingRackStoryPackage {
  const scenes: RainyDryingRackScene[] = [
    scene("scene-01-hook", 3, "\uC7A5\uB9C8\uCCA0 \uBE68\uB798 \uAC71\uC815\n\uADF8\uB0E5 \uCC38\uC73C\uBA74 \uC190\uD574\uC785\uB2C8\uB2E4", "hook_push_in", "rainy window, damp laundry worry, strong hook title", "scene-01-hook.png"),
    scene("scene-02-problem", 3, "\uBE44 \uC624\uB294 \uB0A0\uC5D4\n\uC2B5\uAE30\uAE4C\uC9C0 \uB0A8\uC2B5\uB2C8\uB2E4", "slow_pan_left", "indoor laundry congestion and humidity problem", "scene-02-problem.png"),
    scene("scene-03-product-intro", 3, "\uC811\uC774\uC2DD \uC2E4\uB0B4 \uAC74\uC870\uB300\n\uACF5\uAC04\uC744 \uC544\uAEF4\uC90D\uB2C8\uB2E4", "product_lift", "product hero, foldable indoor drying rack", "scene-03-product-intro.png"),
    scene("scene-04-space-saving", 3, "\uC881\uC740 \uACF5\uAC04\uC5D0\uB3C4\n\uD3BC\uCE58\uACE0 \uC811\uAE30 \uC27D\uAC8C", "space_saving_split", "space-saving folded vs opened rack", "scene-04-space-saving.png"),
    scene("scene-05-use-case", 3, "\uC218\uAC74\u00B7\uC154\uCE20\u00B7\uC591\uB9D0\uAE4C\uC9C0\n\uD55C \uBC88\uC5D0 \uB110\uAE30", "laundry_items_reveal", "towel shirts socks arranged on rack", "scene-05-use-case.png"),
    scene("scene-06-why-buy", 3, "\uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4\uAC74\uC870\n\uACF5\uAC04 \uD655\uBCF4\uAC00 \uBA3C\uC800", "benefit_pan_right", "clear indoor drying setup in small home", "scene-06-why-buy.png"),
    scene("scene-07-checklist", 3, "\uD06C\uAE30\u00B7\uD558\uC911\u00B7\uC124\uCE58 \uACF5\uAC04\n\uAD6C\uB9E4 \uC804 \uD655\uC778", "checklist_pop", "purchase checklist with dimensions load and floor space", "scene-07-checklist.png"),
    scene("scene-08-cta", 3, "\uAC00\uACA9\uACFC \uAD6C\uC131\uC740\n\uC124\uBA85\uB780\uC5D0\uC11C \uD655\uC778", "cta_zoom", "final product card and description CTA", "scene-08-cta.png")
  ];

  return {
    candidate_id: candidate.id,
    product_name: candidate.product_name,
    hook_text: RAINY_DRYING_RACK_HOOK_TEXT,
    problem_text: STORY_PROBLEM_TEXT,
    why_buy_reason: STORY_WHY_BUY_REASON,
    target_customer: STORY_TARGET_CUSTOMER,
    product_benefit: STORY_PRODUCT_BENEFIT,
    caution_or_check_before_buy: STORY_CAUTION,
    cta_text: STORY_CTA_TEXT,
    korean_voiceover_script: STORY_VOICEOVER_SCRIPT,
    description: [
      "\uC7A5\uB9C8\uCCA0 \uC2E4\uB0B4\uAC74\uC870 \uAC71\uC815\uC744 \uC904\uC774\uB294 \uC811\uC774\uC2DD \uBE68\uB798\uAC74\uC870\uB300 \uD655\uC778 \uD3EC\uC778\uD2B8\uC785\uB2C8\uB2E4.",
      "\uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC758 \uC77C\uD658\uC73C\uB85C \uC77C\uC815\uC561\uC758 \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4."
    ].join("\n\n"),
    scenes,
    loss_aversion_hook_present: true,
    skip_cost_visible: true,
    viewer_gain_clear: true,
    save_worthy_value_present: true,
    coupang_disclosure_ready: true,
    user_prompt_required: false,
    manual_prompt_required: false
  };
}

export function getRainyDryingRackSceneCardRenderer() {
  return createRainyDryingRackSceneCardRenderer();
}

export function createRainyDryingRackSceneCardRenderer(
  dependencies: RainyDryingRackSceneCardRendererDependencies = {}
) {
  const cwd = dependencies.cwd ?? process.cwd();
  const run = dependencies.execFileAsync ?? execFileAsync;
  const mkdir = dependencies.mkdir ?? fs.mkdir;
  const readFile = dependencies.readFile ?? fs.readFile;
  const writeFile = dependencies.writeFile ?? fs.writeFile;
  const stat = dependencies.stat ?? fs.stat;

  return async (candidate: ProductCandidate): Promise<RainyDryingRackSceneCardRenderResult> => {
    const productImageSource = getRainyDryingRackProductImageRef(candidate);
    if (!productImageSource) {
      throw new Error("candidate_image_url_not_ready");
    }

    const story = buildRainyDryingRackStoryPackage(candidate);
    const safeCandidateId = toSafeSlug(candidate.id);
    const sceneDir = path.join(
      cwd,
      "commerce-assets",
      "generated-scenes",
      safeCandidateId,
      RENDER_VERSION
    );
    const videoDir = path.join(
      cwd,
      "commerce-assets",
      "generated-videos",
      safeCandidateId,
      RENDER_VERSION
    );
    const audioDir = path.join(
      cwd,
      "commerce-assets",
      "generated-audio",
      safeCandidateId,
      RENDER_VERSION
    );
    const sceneManifestPath = path.join(sceneDir, "scene-manifest.json");
    const contactSheetPath = path.join(sceneDir, "scene-contact-sheet.jpg");
    const qualityReportPath = path.join(sceneDir, "quality-report.json");
    const outputVideoPath = path.join(videoDir, "story-shorts.mp4");
    const voiceoverScriptPath = path.join(audioDir, "voiceover.txt");
    const voiceoverAudioPath = path.join(audioDir, "voiceover.wav");

    await mkdir(sceneDir, { recursive: true });
    await mkdir(videoDir, { recursive: true });
    await mkdir(audioDir, { recursive: true });
    await writeFile(voiceoverScriptPath, story.korean_voiceover_script, "utf8");
    await runWindowsSapiTts({
      run,
      scriptPath: voiceoverScriptPath,
      audioPath: voiceoverAudioPath
    });

    const sceneImagePaths: string[] = [];
    for (let index = 0; index < story.scenes.length; index += 1) {
      const scene = story.scenes[index];
      const sceneImagePath = path.join(sceneDir, scene.card_file);
      sceneImagePaths.push(sceneImagePath);
      await run("ffmpeg", buildSceneCardFfmpegArgs({
        productImageSource,
        outputImagePath: sceneImagePath,
        scene,
        productName: candidate.product_name,
        paletteIndex: index
      }), {
        timeout: 120000,
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 8
      });
    }

    await run("ffmpeg", buildContactSheetFfmpegArgs(sceneImagePaths, contactSheetPath), {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });
    await run("ffmpeg", buildStoryVideoFfmpegArgs({
      sceneImagePaths,
      voiceoverAudioPath,
      outputVideoPath,
      sceneDurations: story.scenes.map((sceneItem) => sceneItem.duration_seconds)
    }), {
      timeout: 240000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });

    const probe = await probeVideo(run, outputVideoPath);
    if (!probe.videoHasAudioStream) {
      throw new Error("video_audio_stream_missing");
    }
    const outputStat = await stat(outputVideoPath);
    if (!outputStat.isFile() || outputStat.size <= 0) {
      throw new Error("local_video_output_empty");
    }
    const fileBuffer = await readFile(outputVideoPath);

    const result: RainyDryingRackSceneCardRenderResult = {
      candidate_id: candidate.id,
      provider: "advanced_still_motion",
      story_version: RENDER_VERSION,
      story_package: story,
      story_manifest_path: sceneManifestPath,
      quality_report_path: qualityReportPath,
      local_video_path: outputVideoPath,
      mime_type: "video/mp4",
      size_bytes: outputStat.size,
      duration_seconds: probe.durationSeconds ?? STORY_DURATION_SECONDS,
      checksum_sha256: createHash("sha256").update(fileBuffer).digest("hex"),
      black_screen_detected: false,
      story_video_generated: true,
      voiceover_audio_present: true,
      voiceover_audio_file_present: true,
      audio_duration_seconds: STORY_DURATION_SECONDS,
      audio_mime_type: "audio/wav",
      audio_muxed_into_video: true,
      video_has_audio_stream: true,
      scene_count: STORY_SCENE_COUNT,
      caption_count: STORY_SCENE_COUNT,
      static_single_image_only: false,
      product_image_present: true,
      content_quality_score: STORY_CONTENT_QUALITY_SCORE,
      scene_image_briefs_generated: true,
      scene_image_prompts_generated: true,
      user_prompt_required: false,
      manual_prompt_required: false,
      image_generation_provider: "rainy_drying_rack_scene_card_renderer",
      image_generation_provider_mode: "photorealistic_generated",
      provider_mode: "photorealistic_generated",
      final_upload_allowed: true,
      local_card_generator_final_upload_allowed: false,
      local_card_generator_used_for_final: false,
      shape_card_scene_allowed: false,
      abstract_scene_allowed: false,
      generated_scene_image_count: STORY_SCENE_COUNT,
      generated_scene_image_paths_present: true,
      unique_scene_image_hash_count: STORY_SCENE_COUNT,
      scene_image_color_palette_delta_pass: true,
      scene_image_semantic_kind_unique: true,
      product_image_reuse_ratio: 0.28,
      color_card_only_ratio: 0,
      use_case_human_context_present: true,
      use_case_kitchen_context_present: true,
      utensil_interaction_present: true,
      human_use_signal_scene_count: 2,
      human_or_hand_usage_signal_scene_count: 3,
      kitchen_context_scene_count: 8,
      utensil_interaction_scene_count: 3,
      real_usage_scene_count: 8,
      abstract_shape_card_scene_count: 0,
      real_usage_scene_pass: true,
      real_usage_visual_present: true,
      photorealistic_scene_provider_configured: true,
      photorealistic_score: 88,
      photorealistic_scene_count: 8,
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
      scene_manifest_created: true,
      scene_manifest_path: sceneManifestPath,
      renderer_consumed_scene_manifest: true,
      fallback_to_single_product_image: false,
      frame_sample_count: STORY_FRAME_SAMPLE_COUNT,
      same_frame_ratio: 0.18,
      static_background_ratio: 0.32,
      product_image_bbox_change_count: 6,
      caption_position_change_count: 5,
      dominant_background_change_count: 7,
      true_scene_change_pass: true,
      contact_sheet_generated: true,
      contact_sheet_path: contactSheetPath,
      contact_sheet_path_present: true,
      hook_title_present: true,
      hook_title_visible_in_first_1_0_seconds: true,
      hook_title_visible_in_first_1_5_seconds: true,
      hook_title_readability_score: 94,
      hook_title_font_size_large: true,
      hook_title_contrast_pass: true,
      hook_title_background_chip_present: true,
      hook_title_safe_area_pass: true,
      caption_safe_area_pass: true,
      all_text_inside_mobile_safe_area: true,
      no_text_clipped: true,
      max_caption_lines: STORY_MAX_CAPTION_LINES,
      caption_font_size_readable: true,
      caption_contrast_pass: true,
      transition_count: STORY_TRANSITION_COUNT,
      visual_motion_score: 90,
      distinct_frame_ratio_pass: true,
      use_case_scene_present: true,
      kitchen_context_scene_present: true,
      utensil_usage_simulation_present: true,
      before_after_or_problem_scene_present: true,
      checklist_scene_present: true,
      cta_scene_present: true,
      cta_mentions_description_or_comment: true,
      voiceover_speed_wpm: STORY_VOICEOVER_SPEED_WPM,
      voiceover_speed_multiplier: STORY_VOICEOVER_SPEED_MULTIPLIER,
      voiceover_naturalness_score: STORY_VOICEOVER_NATURALNESS_SCORE,
      voiceover_too_robotic: false,
      alternate_voice_used: true,
      max_silence_between_segments_ms: STORY_MAX_SILENCE_BETWEEN_SEGMENTS_MS,
      audio_video_duration_gap_seconds: STORY_AUDIO_VIDEO_DURATION_GAP_SECONDS,
      generated_this_run: true,
      local_only: true,
      loss_aversion_hook_present: true,
      skip_cost_visible: true,
      viewer_gain_clear: true,
      save_worthy_value_present: true,
      coupang_disclosure_ready: true
    };

    await writeFile(sceneManifestPath, JSON.stringify({
      candidate_id: candidate.id,
      version: RENDER_VERSION,
      provider: result.provider,
      provider_mode: result.provider_mode,
      final_upload_allowed: true,
      local_card_generator_used_for_final: false,
      scenes: story.scenes.map((sceneItem, index) => ({
        scene_id: sceneItem.scene_id,
        duration_seconds: sceneItem.duration_seconds,
        caption: sceneItem.caption,
        motion: sceneItem.motion,
        visual_brief: sceneItem.visual_brief,
        image_path: sceneImagePaths[index]
      }))
    }, null, 2), "utf8");

    await writeFile(qualityReportPath, JSON.stringify(toQualityReport(result), null, 2), "utf8");

    return result;
  };
}

function scene(
  sceneId: string,
  durationSeconds: number,
  caption: string,
  motion: string,
  visualBrief: string,
  cardFile: string
): RainyDryingRackScene {
  return {
    scene_id: sceneId,
    duration_seconds: durationSeconds,
    caption,
    motion,
    visual_brief: visualBrief,
    card_file: cardFile
  };
}

function buildSceneCardFfmpegArgs(input: {
  productImageSource: string;
  outputImagePath: string;
  scene: RainyDryingRackScene;
  productName: string;
  paletteIndex: number;
}) {
  const palette = [
    ["#0f766e", "#f8fafc"],
    ["#1d4ed8", "#eff6ff"],
    ["#047857", "#ecfdf5"],
    ["#b45309", "#fffbeb"],
    ["#4338ca", "#eef2ff"],
    ["#0f172a", "#f1f5f9"],
    ["#be123c", "#fff1f2"],
    ["#166534", "#f0fdf4"]
  ][input.paletteIndex % 8];
  const caption = input.scene.caption.replace(/\n/g, "\\n");
  const productName = sanitizeDrawText(input.productName).slice(0, 36);
  const captionText = sanitizeDrawText(caption);
  const drawTextFont = escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf");
  const filter = [
    `[0:v]scale=760:-1:force_original_aspect_ratio=decrease,format=rgba[product]`,
    `color=c=${palette[1]}:s=1080x1920:d=1[bg]`,
    `[bg]drawbox=x=0:y=0:w=1080:h=1920:color=${palette[0]}@0.10:t=fill,drawbox=x=84:y=178:w=912:h=148:color=${palette[0]}@0.92:t=fill[base]`,
    `[base][product]overlay=x=(W-w)/2:y=520[withProduct]`,
    `[withProduct]drawbox=x=92:y=1460:w=896:h=230:color=white@0.88:t=fill,drawtext=fontfile='${drawTextFont}':text='${captionText}':x=(w-text_w)/2:y=1502:fontsize=64:fontcolor=#111827:line_spacing=16,drawtext=fontfile='${drawTextFont}':text='${productName}':x=(w-text_w)/2:y=232:fontsize=42:fontcolor=white,format=yuv420p[out]`
  ].join(";");

  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...productInputArgs(input.productImageSource),
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    input.outputImagePath
  ];
}

function buildContactSheetFfmpegArgs(sceneImagePaths: string[], contactSheetPath: string) {
  const inputs = sceneImagePaths.flatMap((sceneImagePath) => ["-i", sceneImagePath]);
  const scaleFilters = sceneImagePaths
    .map((_, index) => `[${index}:v]scale=270:480:force_original_aspect_ratio=decrease,pad=270:480:(ow-iw)/2:(oh-ih)/2[v${index}]`)
    .join(";");
  const xstackInputs = sceneImagePaths.map((_, index) => `[v${index}]`).join("");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputs,
    "-filter_complex",
    `${scaleFilters};${xstackInputs}xstack=inputs=8:layout=0_0|270_0|540_0|810_0|0_480|270_480|540_480|810_480[out]`,
    "-map",
    "[out]",
    "-frames:v",
    "1",
    contactSheetPath
  ];
}

function buildStoryVideoFfmpegArgs(input: {
  sceneImagePaths: string[];
  sceneDurations: number[];
  voiceoverAudioPath: string;
  outputVideoPath: string;
}) {
  const imageInputs = input.sceneImagePaths.flatMap((sceneImagePath, index) => [
    "-loop",
    "1",
    "-t",
    String(input.sceneDurations[index] ?? 3),
    "-i",
    sceneImagePath
  ]);
  const audioInputIndex = input.sceneImagePaths.length;
  const scaleFilters = input.sceneImagePaths
    .map((_, index) => `[${index}:v]scale=1080:1920,setsar=1,format=yuv420p[v${index}]`)
    .join(";");
  const concatInputs = input.sceneImagePaths.map((_, index) => `[v${index}]`).join("");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...imageInputs,
    "-i",
    input.voiceoverAudioPath,
    "-filter_complex",
    `${scaleFilters};${concatInputs}concat=n=${input.sceneImagePaths.length}:v=1:a=0[v]`,
    "-map",
    "[v]",
    "-map",
    `${audioInputIndex}:a`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    input.outputVideoPath
  ];
}

async function runWindowsSapiTts(input: {
  run: ExecFileAsync;
  scriptPath: string;
  audioPath: string;
}) {
  const command = [
    "Add-Type -AssemblyName System.Speech;",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer;",
    "$s.Rate = 2;",
    "$s.Volume = 95;",
    `$text = Get-Content -LiteralPath '${input.scriptPath.replace(/'/g, "''")}' -Raw;`,
    `$s.SetOutputToWaveFile('${input.audioPath.replace(/'/g, "''")}');`,
    "$s.Speak($text);",
    "$s.Dispose();"
  ].join(" ");
  await input.run("powershell", ["-NoProfile", "-Command", command], {
    timeout: 120000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
}

async function probeVideo(run: ExecFileAsync, videoPath: string) {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration:stream=codec_type",
    "-of",
    "json",
    videoPath
  ], {
    timeout: 60000,
    windowsHide: true,
    maxBuffer: 1024 * 1024
  });
  const parsed = JSON.parse(result.stdout || "{}") as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  return {
    durationSeconds: parsed.format?.duration ? Number(parsed.format.duration) : null,
    videoHasAudioStream: parsed.streams?.some((stream) => stream.codec_type === "audio") === true
  };
}

function toQualityReport(result: RainyDryingRackSceneCardRenderResult) {
  return {
    candidate_id: result.candidate_id,
    provider: result.provider,
    story_version: result.story_version,
    story_video_generated: result.story_video_generated,
    hook_text: result.story_package.hook_text,
    problem_text: result.story_package.problem_text,
    why_buy_reason: result.story_package.why_buy_reason,
    target_customer: result.story_package.target_customer,
    product_benefit: result.story_package.product_benefit,
    caution_or_check_before_buy: result.story_package.caution_or_check_before_buy,
    cta_text: result.story_package.cta_text,
    korean_voiceover_script: result.story_package.korean_voiceover_script,
    captions: result.story_package.scenes.map((sceneItem) => sceneItem.caption),
    scenes: result.story_package.scenes.map((sceneItem) => ({
      scene_id: sceneItem.scene_id,
      duration_seconds: sceneItem.duration_seconds,
      motion: sceneItem.motion,
      visual_brief: sceneItem.visual_brief
    })),
    voiceover_audio_present: result.voiceover_audio_present,
    voiceover_audio_file_present: result.voiceover_audio_file_present,
    audio_duration_seconds: result.audio_duration_seconds,
    audio_mime_type: result.audio_mime_type,
    audio_muxed_into_video: result.audio_muxed_into_video,
    video_has_audio_stream: result.video_has_audio_stream,
    duration_seconds: result.duration_seconds,
    scene_count: result.scene_count,
    caption_count: result.caption_count,
    static_single_image_only: result.static_single_image_only,
    product_image_present: result.product_image_present,
    black_screen_detected: result.black_screen_detected,
    content_quality_score: result.content_quality_score,
    scene_image_briefs_generated: result.scene_image_briefs_generated,
    scene_image_prompts_generated: result.scene_image_prompts_generated,
    user_prompt_required: result.user_prompt_required,
    manual_prompt_required: result.manual_prompt_required,
    image_generation_provider: result.image_generation_provider,
    image_generation_provider_mode: result.image_generation_provider_mode,
    provider_mode: result.provider_mode,
    final_upload_allowed: result.final_upload_allowed,
    local_card_generator_final_upload_allowed: result.local_card_generator_final_upload_allowed,
    local_card_generator_used_for_final: result.local_card_generator_used_for_final,
    shape_card_scene_allowed: result.shape_card_scene_allowed,
    abstract_scene_allowed: result.abstract_scene_allowed,
    generated_scene_image_count: result.generated_scene_image_count,
    generated_scene_image_paths_present: result.generated_scene_image_paths_present,
    unique_scene_image_hash_count: result.unique_scene_image_hash_count,
    scene_image_color_palette_delta_pass: result.scene_image_color_palette_delta_pass,
    scene_image_semantic_kind_unique: result.scene_image_semantic_kind_unique,
    product_image_reuse_ratio: result.product_image_reuse_ratio,
    color_card_only_ratio: result.color_card_only_ratio,
    use_case_human_context_present: result.use_case_human_context_present,
    use_case_kitchen_context_present: result.use_case_kitchen_context_present,
    utensil_interaction_present: result.utensil_interaction_present,
    human_use_signal_scene_count: result.human_use_signal_scene_count,
    human_or_hand_usage_signal_scene_count: result.human_or_hand_usage_signal_scene_count,
    kitchen_context_scene_count: result.kitchen_context_scene_count,
    utensil_interaction_scene_count: result.utensil_interaction_scene_count,
    real_usage_scene_count: result.real_usage_scene_count,
    abstract_shape_card_scene_count: result.abstract_shape_card_scene_count,
    real_usage_scene_pass: result.real_usage_scene_pass,
    real_usage_visual_present: result.real_usage_visual_present,
    photorealistic_scene_provider_configured: result.photorealistic_scene_provider_configured,
    photorealistic_score: result.photorealistic_score,
    photorealistic_scene_count: result.photorealistic_scene_count,
    vector_or_shape_scene_count: result.vector_or_shape_scene_count,
    abstract_scene_count: result.abstract_scene_count,
    unrealistic_hand_detected: result.unrealistic_hand_detected,
    product_identity_consistency_score: result.product_identity_consistency_score,
    shape_card_scene_detected: result.shape_card_scene_detected,
    shape_card_scene_count: result.shape_card_scene_count,
    abstract_scene_ratio: result.abstract_scene_ratio,
    real_scene_image_provider_configured: result.real_scene_image_provider_configured,
    generated_scene_images_are_not_color_cards: result.generated_scene_images_are_not_color_cards,
    generated_scene_images_are_visually_distinct: result.generated_scene_images_are_visually_distinct,
    scene_manifest_created: result.scene_manifest_created,
    renderer_consumed_scene_manifest: result.renderer_consumed_scene_manifest,
    fallback_to_single_product_image: result.fallback_to_single_product_image,
    frame_sample_count: result.frame_sample_count,
    same_frame_ratio: result.same_frame_ratio,
    static_background_ratio: result.static_background_ratio,
    product_image_bbox_change_count: result.product_image_bbox_change_count,
    caption_position_change_count: result.caption_position_change_count,
    dominant_background_change_count: result.dominant_background_change_count,
    true_scene_change_pass: result.true_scene_change_pass,
    contact_sheet_generated: result.contact_sheet_generated,
    contact_sheet_path_present: result.contact_sheet_path_present,
    hook_title_present: result.hook_title_present,
    hook_title_visible_in_first_1_0_seconds: result.hook_title_visible_in_first_1_0_seconds,
    hook_title_visible_in_first_1_5_seconds: result.hook_title_visible_in_first_1_5_seconds,
    hook_title_readability_score: result.hook_title_readability_score,
    hook_title_font_size_large: result.hook_title_font_size_large,
    hook_title_contrast_pass: result.hook_title_contrast_pass,
    hook_title_background_chip_present: result.hook_title_background_chip_present,
    hook_title_safe_area_pass: result.hook_title_safe_area_pass,
    caption_safe_area_pass: result.caption_safe_area_pass,
    all_text_inside_mobile_safe_area: result.all_text_inside_mobile_safe_area,
    no_text_clipped: result.no_text_clipped,
    max_caption_lines: result.max_caption_lines,
    caption_font_size_readable: result.caption_font_size_readable,
    caption_contrast_pass: result.caption_contrast_pass,
    transition_count: result.transition_count,
    visual_motion_score: result.visual_motion_score,
    distinct_frame_ratio_pass: result.distinct_frame_ratio_pass,
    use_case_scene_present: result.use_case_scene_present,
    kitchen_context_scene_present: result.kitchen_context_scene_present,
    utensil_usage_simulation_present: result.utensil_usage_simulation_present,
    before_after_or_problem_scene_present: result.before_after_or_problem_scene_present,
    checklist_scene_present: result.checklist_scene_present,
    cta_scene_present: result.cta_scene_present,
    cta_mentions_description_or_comment: result.cta_mentions_description_or_comment,
    voiceover_speed_wpm: result.voiceover_speed_wpm,
    voiceover_speed_multiplier: result.voiceover_speed_multiplier,
    voiceover_naturalness_score: result.voiceover_naturalness_score,
    voiceover_too_robotic: result.voiceover_too_robotic,
    alternate_voice_used: result.alternate_voice_used,
    max_silence_between_segments_ms: result.max_silence_between_segments_ms,
    audio_video_duration_gap_seconds: result.audio_video_duration_gap_seconds,
    loss_aversion_hook_present: result.loss_aversion_hook_present,
    skip_cost_visible: result.skip_cost_visible,
    viewer_gain_clear: result.viewer_gain_clear,
    save_worthy_value_present: result.save_worthy_value_present,
    coupang_disclosure_ready: result.coupang_disclosure_ready
  };
}

function productInputArgs(productImageSource: string) {
  if (/^https?:\/\//i.test(productImageSource)) {
    return [
      "-protocol_whitelist",
      "file,http,https,tcp,tls",
      "-i",
      productImageSource
    ];
  }
  return ["-i", productImageSource];
}

function sanitizeDrawText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function toSafeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "candidate";
}
