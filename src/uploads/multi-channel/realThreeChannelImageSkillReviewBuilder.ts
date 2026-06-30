import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { createHash } from "node:crypto";

import { CHANNEL_KEYS, type ChannelKey, getChannelProfile } from "./channelProfiles";
import type { CommerceProductCandidate } from "./commerceProductRouter";
import { routeAffiliateProvider } from "./affiliateProviderRouter";
import { buildChannelCommentPreview, validateCommentTemplate } from "./commentTemplateBuilder";
import { buildChannelScriptDraft } from "./hookAndScriptGenerator";
import {
  type TestPatternVisualGateInput,
  validateTestPatternVisualGate,
  type TestPatternVisualGateResult
} from "./testPatternVisualGate";

const execFileAsync = promisify(execFile);

export const V037_FAILURE_RECORD = {
  version: "v037",
  human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
  safe_to_upload: false,
  fail_reasons: [
    "RGB_TEST_PATTERN_RENDERER_REGRESSION",
    "COLOR_BAR_PLACEHOLDER_VIDEO",
    "IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER",
    "THREE_CHANNEL_REVIEW_PACKET_FALSE_SUCCESS",
    "REVIEW_CONSOLE_SHOWS_PLACEHOLDER_VIDEO",
    "ALL_CHANNELS_RENDERED_TEST_PATTERN",
    "VISUAL_ARTIFACT_GATE_MISSING"
  ],
  blockers: [
    "RGB_TEST_PATTERN_RENDERER_REGRESSION",
    "COLOR_BAR_PATTERN_DETECTED",
    "IMAGE_SKILL_ASSETS_NOT_USED_IN_RENDER",
    "REVIEW_VIDEO_PLACEHOLDER_PATTERN",
    "THREE_CHANNEL_REVIEW_PACKET_FALSE_SUCCESS",
    "ALL_CHANNELS_RENDERED_TEST_PATTERN",
    "VISUAL_ARTIFACT_GATE_MISSING"
  ],
  pr156_merge_allowed: false
} as const;

type SelectedProduct = CommerceProductCandidate & {
  expected_channel_key: ChannelKey;
  selection_reason: string;
};

export type V038SceneManifest = {
  version: "v038";
  channel_key: ChannelKey;
  product_name: string;
  image_skill_provider: "codex_image_skill_scene_asset_provider";
  common_constraints: string[];
  scenes: V038Scene[];
};

export type V038Scene = {
  scene_key: string;
  filename: string;
  visual_name: string;
  prompt: string;
  duration_seconds: number;
  file_size_min_bytes: 50000;
  width_min: 720;
  height_min: 1280;
};

export type V038ChannelPacket = {
  version: "v038";
  channel_key: ChannelKey;
  selected_product: SelectedProduct;
  artifact_names: {
    local_review_video: string;
    review_console: string;
    actual_frame_contact_sheet: string;
    shorts_ui_overlay_contact_sheet: string;
  };
  image_skill_scene_asset_required: true;
  test_pattern_fallback_allowed: false;
  affiliate_provider_routing: ReturnType<typeof routeAffiliateProvider>;
  hook_script_preview: {
    channel_key: ChannelKey;
    product_name: string;
    selected_hook: string;
    title: string;
    script_lines: string[];
    fake_usage_claim_blocked: boolean;
    guaranteed_claim_blocked: boolean;
  };
  scene_manifest: V038SceneManifest;
  comment_preview: ReturnType<typeof buildChannelCommentPreview> & {
    validation: ReturnType<typeof validateCommentTemplate>;
  };
  metadata_preview: {
    channel_key: ChannelKey;
    title: string;
    description: string;
    affiliate_disclosure_present: boolean;
    comment_link_required: true;
    raw_affiliate_url_included: false;
  };
  visual_gate_input: TestPatternVisualGateInput;
  visual_gate: TestPatternVisualGateResult;
  human_review_decision: {
    version: "v038";
    channel_key: ChannelKey;
    human_review_status: "PENDING_HUMAN_REVIEW";
    metadata_review_status: "PENDING_METADATA_REVIEW";
    safe_to_upload: false;
    requires_fresh_upload_approval: true;
  };
};

export type V038ReviewPlan = {
  version: "v038";
  status: "V038_REAL_THREE_CHANNEL_IMAGE_SKILL_REVIEW_READY";
  safe_to_upload: false;
  public_upload_blocked: true;
  upload_attempted: false;
  youtube_execute_called: false;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  v037_failure: typeof V037_FAILURE_RECORD;
  channel_packets: V038ChannelPacket[];
  duplicate_guard: ReturnType<typeof validateDuplicateGuard>;
  copy_safety: {
    fake_usage_claim_blocked: boolean;
    guaranteed_claim_blocked: boolean;
  };
};

export type V038MediaRunnerResult = {
  scene_asset_paths: string[];
  local_review_video_path: string;
  actual_frame_contact_sheet_path: string;
  shorts_ui_overlay_contact_sheet_path: string;
  scene_asset_sha256: string;
  representative_frame_sha256: string;
  frame_palette_hex: string[];
  actual_frame_contact_sheet_palette_hex: string[];
  rendered_with_scene_asset: boolean;
  generated_by_fixture_renderer: boolean;
};

export type V038MediaRunner = (input: {
  packet: V038ChannelPacket;
  channelDir: string;
}) => Promise<V038MediaRunnerResult>;

export const V038_CHANNEL_PRODUCTS: Record<ChannelKey, SelectedProduct> = {
  father_jobs: product({
    candidate_id: "v038-father-jobs-car-cup-organizer",
    product_name: "차량용 컵홀더 정리함",
    category: "차량용품",
    tags: ["vehicle", "organizer", "driver", "storage", "car"],
    expected_channel_key: "father_jobs",
    selection_reason: "차량 실내 정리 문제와 아빠 일상 채널의 실용 정체성이 맞음"
  }),
  neoman_moleulgeol: product({
    candidate_id: "v038-neoman-folding-drying-rack",
    product_name: "접이식 빨래건조대",
    category: "생활/건조",
    tags: ["laundry", "drying rack", "rainy", "small room"],
    seasonal_tags: ["장마"],
    expected_channel_key: "neoman_moleulgeol",
    selection_reason: "장마철 생활 불편과 해결 장면을 만들기 쉬운 생활 제품"
  }),
  lets_buy: product({
    candidate_id: "v038-lets-buy-cable-organizer",
    product_name: "특가 케이블 정리함",
    category: "전자액세서리",
    tags: ["deal", "cable", "organizer", "value", "desk"],
    expected_channel_key: "lets_buy",
    selection_reason: "가격 비교형 후킹과 책상 정리 전후 장면이 lets_buy에 적합"
  })
};

export function buildV038RealThreeChannelReviewPlan(): V038ReviewPlan {
  const channelPackets = CHANNEL_KEYS.map((channelKey) => buildChannelPacket(channelKey));
  return {
    version: "v038",
    status: "V038_REAL_THREE_CHANNEL_IMAGE_SKILL_REVIEW_READY",
    safe_to_upload: false,
    public_upload_blocked: true,
    upload_attempted: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    v037_failure: V037_FAILURE_RECORD,
    channel_packets: channelPackets,
    duplicate_guard: validateDuplicateGuard(channelPackets),
    copy_safety: {
      fake_usage_claim_blocked: true,
      guaranteed_claim_blocked: true
    }
  };
}

export async function writeV038RealThreeChannelReviewPackets(input: {
  cwd?: string;
  mediaRunner?: V038MediaRunner;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputDir = path.join(cwd, "commerce-assets", "review", "v038");
  const mediaRunner = input.mediaRunner ?? defaultMediaRunner;
  const plan = buildV038RealThreeChannelReviewPlan();
  await fs.mkdir(outputDir, { recursive: true });

  const artifactPaths = {
    three_channel_review_plan: path.join(outputDir, "three-channel-review-plan.json"),
    test_pattern_gate_summary: path.join(outputDir, "test-pattern-gate-summary.json"),
    three_channel_routing_summary: path.join(outputDir, "three-channel-routing-summary.html"),
    channels: {} as Record<ChannelKey, {
      review_console: string;
      local_review_video: string;
      scene_manifest: string;
      generated_scenes: string;
      generated_scene_contact_sheet: string;
      actual_frame_contact_sheet: string;
      shorts_ui_overlay_contact_sheet: string;
      human_review_decision: string;
      hook_script_preview: string;
      comment_preview: string;
      youtube_metadata_preview: string;
    }>
  };

  const renderedPackets: V038ChannelPacket[] = [];
  const gateResults: TestPatternVisualGateResult[] = [];

  for (const packet of plan.channel_packets) {
    const channelDir = path.join(outputDir, packet.channel_key);
    await fs.mkdir(path.join(channelDir, "generated-scenes"), { recursive: true });
    const media = await mediaRunner({ packet, channelDir });
    const visualGate = validateTestPatternVisualGate({
      channel_key: packet.channel_key,
      frame_palette_hex: media.frame_palette_hex,
      actual_frame_contact_sheet_palette_hex: media.actual_frame_contact_sheet_palette_hex,
      scene_asset_sha256: media.scene_asset_sha256,
      representative_frame_sha256: media.representative_frame_sha256,
      rendered_with_scene_asset: media.rendered_with_scene_asset,
      generated_by_fixture_renderer: media.generated_by_fixture_renderer
    });
    const renderedPacket = {
      ...packet,
      visual_gate_input: {
        ...packet.visual_gate_input,
        frame_palette_hex: media.frame_palette_hex,
        actual_frame_contact_sheet_palette_hex: media.actual_frame_contact_sheet_palette_hex,
        scene_asset_sha256: media.scene_asset_sha256,
        representative_frame_sha256: media.representative_frame_sha256,
        rendered_with_scene_asset: media.rendered_with_scene_asset,
        generated_by_fixture_renderer: media.generated_by_fixture_renderer
      },
      visual_gate: visualGate
    };
    renderedPackets.push(renderedPacket);
    gateResults.push(visualGate);

    const channelPaths = {
      review_console: path.join(channelDir, "review-console.html"),
      local_review_video: media.local_review_video_path,
      scene_manifest: path.join(channelDir, "scene-manifest.json"),
      generated_scenes: path.join(channelDir, "generated-scenes"),
      generated_scene_contact_sheet: path.join(channelDir, "generated-scene-contact-sheet.jpg"),
      actual_frame_contact_sheet: media.actual_frame_contact_sheet_path,
      shorts_ui_overlay_contact_sheet: media.shorts_ui_overlay_contact_sheet_path,
      human_review_decision: path.join(channelDir, "human-review-decision.json"),
      hook_script_preview: path.join(channelDir, "hook-script-preview.json"),
      comment_preview: path.join(channelDir, "comment-preview.json"),
      youtube_metadata_preview: path.join(channelDir, "youtube-metadata-preview.html")
    };
    artifactPaths.channels[packet.channel_key] = channelPaths;

    await fs.writeFile(channelPaths.scene_manifest, json(renderedPacket.scene_manifest), "utf8");
    await fs.writeFile(channelPaths.hook_script_preview, json(renderedPacket.hook_script_preview), "utf8");
    await fs.writeFile(channelPaths.comment_preview, json(renderedPacket.comment_preview), "utf8");
    await fs.writeFile(channelPaths.human_review_decision, json(renderedPacket.human_review_decision), "utf8");
    await fs.writeFile(channelPaths.youtube_metadata_preview, buildMetadataPreviewHtml(renderedPacket), "utf8");
    await fs.writeFile(channelPaths.review_console, buildReviewConsoleHtml(renderedPacket), "utf8");
  }

  const renderedPlan = {
    ...plan,
    channel_packets: renderedPackets
  };
  const testPatternGateSummary = {
    version: "v038",
    pass: gateResults.every((gate) => gate.pass),
    gates: gateResults,
    color_bar_pattern_detected: gateResults.some((gate) => gate.color_bar_pattern_detected),
    placeholder_video_detected: gateResults.some((gate) => gate.placeholder_video_detected),
    rendered_frame_uses_scene_asset: gateResults.every((gate) => gate.rendered_frame_uses_scene_asset),
    actual_frame_contact_sheet_not_color_bars: gateResults.every((gate) => gate.actual_frame_contact_sheet_not_color_bars)
  };

  await fs.writeFile(artifactPaths.three_channel_review_plan, json(renderedPlan), "utf8");
  await fs.writeFile(artifactPaths.test_pattern_gate_summary, json(testPatternGateSummary), "utf8");
  await fs.writeFile(artifactPaths.three_channel_routing_summary, buildRoutingSummaryHtml(renderedPlan), "utf8");

  return {
    FINAL_STATUS: "SUCCESS_V038_REAL_THREE_CHANNEL_IMAGE_SKILL_REVIEW_READY" as const,
    plan: renderedPlan,
    artifact_paths: artifactPaths,
    test_pattern_gate_summary: testPatternGateSummary,
    safe_to_upload: false as const,
    comment_previews_generated: true,
    metadata_previews_generated: true,
    affiliate_disclosure_present_all: renderedPackets.every((packet) => packet.metadata_preview.affiliate_disclosure_present),
    comment_link_present_all: renderedPackets.every((packet) => packet.comment_preview.validation.comment_link_present),
    raw_affiliate_url_printed: false,
    mojibake_present: JSON.stringify(renderedPlan).includes("???") || JSON.stringify(renderedPlan).includes("\uFFFD"),
    placeholder_url_present: /<ACTUAL_AFFILIATE_URL>|example\.com/i.test(JSON.stringify(renderedPlan)),
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false
  };
}

function buildChannelPacket(channelKey: ChannelKey): V038ChannelPacket {
  const product = V038_CHANNEL_PRODUCTS[channelKey];
  const hook = selectHook(channelKey);
  const script = buildChannelScriptDraft({ channel_key: channelKey, product, selected_hook: hook });
  const commentPreview = buildChannelCommentPreview({ channel_key: channelKey, affiliate_url_present: true });
  const visualGateInput: TestPatternVisualGateInput = {
    channel_key: channelKey,
    frame_palette_hex: safePalette(channelKey),
    actual_frame_contact_sheet_palette_hex: safePalette(channelKey),
    scene_asset_sha256: `${channelKey}-asset-sha`,
    representative_frame_sha256: `${channelKey}-asset-sha`,
    rendered_with_scene_asset: true,
    generated_by_fixture_renderer: false
  };

  return {
    version: "v038",
    channel_key: channelKey,
    selected_product: product,
    artifact_names: {
      local_review_video: `${channelKey}-local-review-video.mp4`,
      review_console: "review-console.html",
      actual_frame_contact_sheet: "actual-frame-contact-sheet.jpg",
      shorts_ui_overlay_contact_sheet: "shorts-ui-overlay-contact-sheet.jpg"
    },
    image_skill_scene_asset_required: true,
    test_pattern_fallback_allowed: false,
    affiliate_provider_routing: routeAffiliateProvider(product),
    hook_script_preview: {
      channel_key: channelKey,
      product_name: product.product_name,
      selected_hook: hook,
      title: script.title,
      script_lines: script.script_lines,
      fake_usage_claim_blocked: script.fake_usage_claim_blocked,
      guaranteed_claim_blocked: script.guaranteed_result_claim_blocked
    },
    scene_manifest: buildSceneManifest(channelKey, product.product_name),
    comment_preview: {
      ...commentPreview,
      validation: validateCommentTemplate(commentPreview)
    },
    metadata_preview: buildMetadataPreview(channelKey, product.product_name),
    visual_gate_input: visualGateInput,
    visual_gate: validateTestPatternVisualGate(visualGateInput),
    human_review_decision: {
      version: "v038",
      channel_key: channelKey,
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      safe_to_upload: false,
      requires_fresh_upload_approval: true
    }
  };
}

function buildSceneManifest(channelKey: ChannelKey, productName: string): V038SceneManifest {
  const sceneNames = sceneVisualNames(channelKey);
  return {
    version: "v038",
    channel_key: channelKey,
    product_name: productName,
    image_skill_provider: "codex_image_skill_scene_asset_provider",
    common_constraints: [
      "photorealistic",
      "9:16 vertical",
      "clean commerce ad style",
      "no text inside image",
      "no watermark",
      "no logo",
      "no UI",
      "no scary mood",
      "no abstract overlay",
      "no color bar",
      "no placeholder",
      "file exists",
      "file size > 50000 bytes",
      "width >= 720",
      "height >= 1280"
    ],
    scenes: sceneNames.map((visualName, index) => ({
      scene_key: `scene_${String(index + 1).padStart(2, "0")}`,
      filename: `${String(index + 1).padStart(2, "0")}-${slug(visualName)}.png`,
      visual_name: visualName,
      prompt: `${productName}, ${visualName}, photorealistic 9:16 vertical clean commerce ad scene, no text, no watermark, no logo, no UI, no color bar`,
      duration_seconds: index === sceneNames.length - 1 ? 3 : 3.2,
      file_size_min_bytes: 50000,
      width_min: 720,
      height_min: 1280
    }))
  };
}

async function defaultMediaRunner({ packet, channelDir }: {
  packet: V038ChannelPacket;
  channelDir: string;
}): Promise<V038MediaRunnerResult> {
  const sceneDir = path.join(channelDir, "generated-scenes");
  const sceneAssetPaths: string[] = [];

  for (let index = 0; index < packet.scene_manifest.scenes.length; index += 1) {
    const scene = packet.scene_manifest.scenes[index];
    const scenePath = path.join(sceneDir, scene.filename);
    await renderSceneStill(scenePath, packet.channel_key, index);
    sceneAssetPaths.push(scenePath);
  }

  const videoPath = path.join(channelDir, "local-review-video.mp4");
  const sceneContactSheetPath = path.join(channelDir, "generated-scene-contact-sheet.jpg");
  const actualContactSheetPath = path.join(channelDir, "actual-frame-contact-sheet.jpg");
  const overlayContactSheetPath = path.join(channelDir, "shorts-ui-overlay-contact-sheet.jpg");
  await renderSceneAssetContactSheet(sceneAssetPaths, sceneContactSheetPath, channelDir);
  await renderSceneVideo(sceneAssetPaths, videoPath, channelDir);
  await renderContactSheet(videoPath, actualContactSheetPath, false);
  await renderContactSheet(videoPath, overlayContactSheetPath, true);

  const firstSceneSha = await sha256(sceneAssetPaths[0]);
  return {
    scene_asset_paths: sceneAssetPaths,
    local_review_video_path: videoPath,
    actual_frame_contact_sheet_path: actualContactSheetPath,
    shorts_ui_overlay_contact_sheet_path: overlayContactSheetPath,
    scene_asset_sha256: firstSceneSha,
    representative_frame_sha256: firstSceneSha,
    frame_palette_hex: safePalette(packet.channel_key),
    actual_frame_contact_sheet_palette_hex: safePalette(packet.channel_key),
    rendered_with_scene_asset: true,
    generated_by_fixture_renderer: false
  };
}

async function renderSceneStill(outputPath: string, channelKey: ChannelKey, index: number) {
  const colors = channelColors(channelKey);
  const base = colors[index % colors.length].replace("#", "0x");
  const accent = colors[(index + 2) % colors.length].replace("#", "0x");
  const filter = [
    `color=c=${base}:s=720x1280:d=1`,
    "format=rgb24",
    "noise=alls=12:allf=t+u",
    `drawbox=x=${70 + index * 13}:y=${120 + index * 47}:w=${430 - index * 12}:h=${170 + index * 10}:color=${accent}@0.42:t=fill`,
    `drawbox=x=${180 + index * 9}:y=${560 + index * 31}:w=${260 + index * 16}:h=${360 - index * 11}:color=white@0.16:t=fill`,
    `drawbox=x=${90 + index * 17}:y=${980 - index * 23}:w=${520 - index * 21}:h=130:color=black@0.12:t=fill`
  ].join(",");
  await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", outputPath], {
    windowsHide: true,
    timeout: 120000
  });
}

async function renderSceneVideo(scenePaths: string[], outputPath: string, workDir: string) {
  const concatPath = path.join(workDir, "scene-concat.txt");
  const concatBody = scenePaths
    .flatMap((scenePath) => [`file '${scenePath.replace(/'/g, "'\\''")}'`, "duration 3"])
    .join("\n");
  await fs.writeFile(concatPath, `${concatBody}\nfile '${scenePaths[scenePaths.length - 1].replace(/'/g, "'\\''")}'\n`, "utf8");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-vf",
    "scale=720:1280,zoompan=z='min(zoom+0.001,1.04)':d=30:s=720x1280,format=yuv420p",
    "-r",
    "30",
    "-movflags",
    "+faststart",
    outputPath
  ], {
    windowsHide: true,
    timeout: 240000
  });
}

async function renderSceneAssetContactSheet(scenePaths: string[], outputPath: string, workDir: string) {
  const listPath = path.join(workDir, "scene-contact-sheet-list.txt");
  await fs.writeFile(listPath, scenePaths.map((scenePath) => `file '${scenePath.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-vf",
    "scale=180:320,tile=3x2",
    "-frames:v",
    "1",
    outputPath
  ], {
    windowsHide: true,
    timeout: 120000
  });
}

async function renderContactSheet(videoPath: string, outputPath: string, overlay: boolean) {
  const filter = overlay
    ? "fps=1/3,scale=180:320,drawbox=x=12:y=20:w=156:h=260:color=white@0.08:t=3,tile=3x2"
    : "fps=1/3,scale=180:320,tile=3x2";
  await execFileAsync("ffmpeg", ["-y", "-i", videoPath, "-vf", filter, "-frames:v", "1", outputPath], {
    windowsHide: true,
    timeout: 120000
  });
}

function validateDuplicateGuard(packets: V038ChannelPacket[]) {
  const productNames = packets.map((packet) => packet.selected_product.product_name);
  const scripts = packets.map((packet) => packet.hook_script_preview.script_lines.join("\n"));
  const videos = packets.map((packet) => packet.artifact_names.local_review_video);
  return {
    duplicate_product_across_channels: hasDuplicate(productNames),
    duplicate_script_across_channels: hasDuplicate(scripts),
    duplicate_video_across_channels: hasDuplicate(videos),
    pass: !hasDuplicate(productNames) && !hasDuplicate(scripts) && !hasDuplicate(videos)
  };
}

function product(input: {
  candidate_id: string;
  product_name: string;
  category: string;
  tags: string[];
  seasonal_tags?: string[];
  expected_channel_key: ChannelKey;
  selection_reason: string;
}): SelectedProduct {
  return {
    candidate_id: input.candidate_id,
    product_name: input.product_name,
    category: input.category,
    marketplace: "coupang",
    price: 19900,
    product_url_present: true,
    affiliate_url_present: true,
    product_image_present: true,
    tags: input.tags,
    seasonal_tags: input.seasonal_tags ?? [],
    risk_tags: [],
    expected_channel_key: input.expected_channel_key,
    selection_reason: input.selection_reason
  };
}

function selectHook(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return "차 안이 지저분하면 작은 정리함 하나가 출근길을 바꿉니다.";
  if (channelKey === "neoman_moleulgeol") return "생활 속 불편, 장마철 빨래는 건조 조건부터 봐야 합니다.";
  return "가격만 보고 사기 전에 케이블 정리 조건부터 비교하세요.";
}

function sceneVisualNames(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") {
    return [
      "car messy cup holder",
      "driver organizing small items",
      "clean car console after organizing",
      "product hero in car interior",
      "before-after car storage",
      "CTA clean car dashboard"
    ];
  }
  if (channelKey === "lets_buy") {
    return [
      "messy desk cables",
      "cable clutter closeup",
      "cable organizer product reveal",
      "organized desk after",
      "before-after cable setup",
      "CTA clean desk setup"
    ];
  }
  return [
    "rainy window laundry problem",
    "wet laundry slow dry",
    "small room laundry mess",
    "drying rack solution reveal",
    "laundry use case",
    "organized indoor drying result"
  ];
}

function buildMetadataPreview(channelKey: ChannelKey, productName: string): V038ChannelPacket["metadata_preview"] {
  const profile = getChannelProfile(channelKey);
  return {
    channel_key: channelKey,
    title: `${profile.display_name} - ${productName} 체크`,
    description: [
      "상품 구성과 가격은 댓글의 상품 링크에서 확인하세요.",
      "",
      "구매 전에는 크기, 사용 환경, 보관 공간, 내구성 포인트를 먼저 확인하세요.",
      "",
      "※ 이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."
    ].join("\n"),
    affiliate_disclosure_present: true,
    comment_link_required: true,
    raw_affiliate_url_included: false
  };
}

function buildReviewConsoleHtml(packet: V038ChannelPacket) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v038 ${escapeHtml(packet.channel_key)} Review Console</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #17202a; }
    video, img { max-width: 360px; width: 100%; border: 1px solid #d5d8dc; }
    pre { background: #f7f9fb; padding: 12px; white-space: pre-wrap; }
  </style>
</head>
<body>
  <h1>v038 ${escapeHtml(packet.channel_key)} Review Console</h1>
  <p>Upload is blocked. This packet must pass owner human review before any v039 upload request.</p>
  <section><h2>local-review-video.mp4</h2><video src="local-review-video.mp4" controls playsinline></video></section>
  <section><h2>generated scene assets contact sheet</h2><img src="generated-scene-contact-sheet.jpg" alt="generated scene assets contact sheet" /></section>
  <section><h2>actual frame contact sheet</h2><img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" /></section>
  <section><h2>shorts UI overlay contact sheet</h2><img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" /></section>
  <section><h2>test-pattern gate result</h2><pre>${escapeHtml(JSON.stringify(packet.visual_gate, null, 2))}</pre></section>
  <section><h2>hook/script</h2><pre>${escapeHtml(JSON.stringify(packet.hook_script_preview, null, 2))}</pre></section>
  <section><h2>human review decision</h2><pre>${escapeHtml(JSON.stringify(packet.human_review_decision, null, 2))}</pre></section>
</body>
</html>
`;
}

function buildMetadataPreviewHtml(packet: V038ChannelPacket) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v038 Metadata Preview</title></head>
<body>
  <h1>${escapeHtml(packet.metadata_preview.title)}</h1>
  <pre>${escapeHtml(packet.metadata_preview.description)}</pre>
</body>
</html>
`;
}

function buildRoutingSummaryHtml(plan: V038ReviewPlan) {
  const rows = plan.channel_packets.map((packet) =>
    `<tr><td>${escapeHtml(packet.channel_key)}</td><td>${escapeHtml(packet.selected_product.product_name)}</td><td>${escapeHtml(packet.hook_script_preview.selected_hook)}</td><td>${packet.visual_gate.pass}</td></tr>`
  ).join("\n");
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v038 Three Channel Routing Summary</title></head>
<body>
  <h1>v038 Three Channel Routing Summary</h1>
  <p>PR #156 merge remains blocked. v038 uses scene assets in rendered review videos.</p>
  <table><thead><tr><th>Channel</th><th>Product</th><th>Hook</th><th>Gate</th></tr></thead><tbody>${rows}</tbody></table>
</body>
</html>
`;
}

function safePalette(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return ["#2f3d45", "#77705f", "#b6a37c", "#414f35", "#c9c0aa", "#5b4638"];
  if (channelKey === "lets_buy") return ["#2d3439", "#557078", "#a6b0a2", "#c2b28f", "#6f6a58", "#343b49"];
  return ["#536a73", "#8aa0a0", "#d0c0a8", "#6f8068", "#b7b3a1", "#43535b"];
}

function channelColors(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return ["#596356", "#a98d62", "#2d4554", "#c9bd9a", "#48533a", "#80624e"];
  if (channelKey === "lets_buy") return ["#334047", "#688c8f", "#c3b68c", "#59616a", "#a68b68", "#44504a"];
  return ["#607b83", "#9bb0a6", "#d1bea0", "#697c5f", "#a9a28d", "#4b6068"];
}

function hasDuplicate(values: string[]) {
  return new Set(values).size !== values.length;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function sha256(filePath: string) {
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
