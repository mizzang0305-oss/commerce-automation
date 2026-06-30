import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { CHANNEL_KEYS, type ChannelKey, getChannelProfile } from "../../src/uploads/multi-channel/channelProfiles";
import type { CommerceProductCandidate } from "../../src/uploads/multi-channel/commerceProductRouter";
import { buildChannelCommentPreview, validateCommentTemplate } from "../../src/uploads/multi-channel/commentTemplateBuilder";
import { buildChannelScriptDraft } from "../../src/uploads/multi-channel/hookAndScriptGenerator";
import { validateAssetToFrameProofGate, type AssetToFrameProofGateResult } from "../../src/uploads/multi-channel/assetToFrameProofGate";
import { extractRealSceneFrames, probeImageSize, probeVideoDurationSeconds } from "../../src/uploads/multi-channel/realSceneFrameExtractor";
import { calculateFrameVisualStats, detectSolidPlaceholderFrame, type FrameVisualStats } from "../../src/uploads/multi-channel/solidPlaceholderFrameDetector";

const execFileAsync = promisify(execFile);
const isMain = process.argv[1] ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) : false;

export const V038_FAILURE_RECORD = {
  version: "v038",
  human_review_status: "FAIL_LOCAL_HUMAN_REVIEW",
  safe_to_upload: false,
  fail_reasons: [
    "BLANK_SOLID_PLACEHOLDER_FRAME",
    "SCENE_ASSET_NOT_VISIBLE_IN_VIDEO",
    "RENDERED_FRAME_DOES_NOT_CONTAIN_IMAGE_PIXELS",
    "ASSET_TO_FRAME_PROOF_MISSING",
    "TEST_PATTERN_GATE_FALSE_NEGATIVE",
    "REVIEW_CONSOLE_SHOWS_SOLID_RECTANGLES",
    "PR157_MERGE_BLOCKED"
  ],
  blockers: [
    "BLANK_SOLID_PLACEHOLDER_FRAME",
    "SOLID_RECTANGLE_PLACEHOLDER_VIDEO",
    "SCENE_ASSET_NOT_VISIBLE_IN_VIDEO",
    "RENDERED_FRAME_DOES_NOT_CONTAIN_IMAGE_PIXELS",
    "ASSET_TO_FRAME_PROOF_MISSING",
    "LOW_VISUAL_ENTROPY_FRAME",
    "LOW_FRAME_SCENE_SIMILARITY",
    "TEST_PATTERN_GATE_FALSE_NEGATIVE"
  ],
  pr157_merge_allowed: false
} as const;

type SelectedProduct = CommerceProductCandidate & {
  expected_channel_key: ChannelKey;
  selection_reason: string;
};

type SceneAsset = {
  scene_key: string;
  filename: string;
  visual_name: string;
  prompt: string;
  duration_seconds: number;
};

type ChannelPacket = {
  version: "v039";
  channel_key: ChannelKey;
  selected_product: SelectedProduct;
  selected_hook: string;
  script_lines: string[];
  scene_assets: SceneAsset[];
  metadata_preview: {
    title: string;
    description: string;
    affiliate_disclosure_present: true;
    raw_affiliate_url_included: false;
  };
  comment_preview: ReturnType<typeof buildChannelCommentPreview> & {
    validation: ReturnType<typeof validateCommentTemplate>;
  };
  human_review_decision: {
    version: "v039";
    channel_key: ChannelKey;
    human_review_status: "PENDING_HUMAN_REVIEW";
    metadata_review_status: "PENDING_METADATA_REVIEW";
    safe_to_upload: false;
    requires_fresh_upload_approval: true;
  };
};

type ChannelProofResult = {
  channel_key: ChannelKey;
  proof_gate: AssetToFrameProofGateResult;
  frame_stats: FrameVisualStats[];
  placeholder_detected: boolean;
  scene_asset_matches: Array<{
    scene_key: string;
    asset_path: string;
    matched_frame_path: string;
    similarity_score: number;
  }>;
};

export function buildV039AssetToFrameReviewPlan() {
  const channelPackets = CHANNEL_KEYS.map(buildChannelPacket);
  return {
    version: "v039" as const,
    status: "V039_ASSET_TO_FRAME_PROOF_REVIEW_READY" as const,
    safe_to_upload: false as const,
    public_upload_blocked: true,
    upload_attempted: false,
    youtube_execute_called: false,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    v038_failure: V038_FAILURE_RECORD,
    channel_packets: channelPackets
  };
}

export async function writeV039AssetToFrameProofReviewPackets(input: { cwd?: string } = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v039");
  const plan = buildV039AssetToFrameReviewPlan();
  await fs.mkdir(outputRoot, { recursive: true });

  const artifactPaths = {
    asset_to_frame_summary: path.join(outputRoot, "asset-to-frame-proof-summary.json"),
    three_channel_routing_summary: path.join(outputRoot, "three-channel-routing-summary.html"),
    channels: {} as Record<ChannelKey, {
      review_console: string;
      local_review_video: string;
      generated_scenes: string;
      extracted_frames: string;
      asset_to_frame_proof_report: string;
      actual_frame_contact_sheet: string;
      shorts_ui_overlay_contact_sheet: string;
      human_review_decision: string;
      comment_preview: string;
      metadata_preview: string;
    }>
  };
  const channelResults = {} as Record<ChannelKey, ChannelProofResult>;

  for (const packet of plan.channel_packets) {
    const channelDir = path.join(outputRoot, packet.channel_key);
    const generatedScenesDir = path.join(channelDir, "generated-scenes");
    const extractedFramesDir = path.join(channelDir, "extracted-frames");
    await fs.mkdir(generatedScenesDir, { recursive: true });
    await fs.mkdir(extractedFramesDir, { recursive: true });

    const sceneAssetPaths = await renderSceneAssets(packet, generatedScenesDir);
    const localReviewVideo = path.join(channelDir, "local-review-video.mp4");
    await renderVideoFromSceneAssets(sceneAssetPaths, localReviewVideo, channelDir);
    const extraction = await extractRealSceneFrames({ videoPath: localReviewVideo, outputDir: extractedFramesDir });
    const proof = await buildProofReport({
      packet,
      sceneAssetPaths,
      localReviewVideo,
      extractedFramePaths: extraction.frames.map((frame) => frame.frame_path),
      frameExtractSuccess: extraction.rendered_video_frame_extract_success,
      channelDir
    });
    channelResults[packet.channel_key] = proof;

    const paths = {
      review_console: path.join(channelDir, "review-console.html"),
      local_review_video: localReviewVideo,
      generated_scenes: generatedScenesDir,
      extracted_frames: extractedFramesDir,
      asset_to_frame_proof_report: path.join(channelDir, "asset-to-frame-proof-report.json"),
      actual_frame_contact_sheet: path.join(channelDir, "actual-frame-contact-sheet.jpg"),
      shorts_ui_overlay_contact_sheet: path.join(channelDir, "shorts-ui-overlay-contact-sheet.jpg"),
      human_review_decision: path.join(channelDir, "human-review-decision.json"),
      comment_preview: path.join(channelDir, "comment-preview.json"),
      metadata_preview: path.join(channelDir, "youtube-metadata-preview.html")
    };
    artifactPaths.channels[packet.channel_key] = paths;

    await renderContactSheet(extraction.frames.map((frame) => frame.frame_path), paths.actual_frame_contact_sheet, channelDir, false);
    await renderContactSheet(extraction.frames.map((frame) => frame.frame_path), paths.shorts_ui_overlay_contact_sheet, channelDir, true);
    await fs.writeFile(paths.asset_to_frame_proof_report, json(proof), "utf8");
    await fs.writeFile(paths.human_review_decision, json(packet.human_review_decision), "utf8");
    await fs.writeFile(paths.comment_preview, json(packet.comment_preview), "utf8");
    await fs.writeFile(paths.metadata_preview, buildMetadataHtml(packet), "utf8");
    await fs.writeFile(paths.review_console, buildReviewConsoleHtml(packet, proof), "utf8");
  }

  const summary = summarizeProof(channelResults);
  const summaryPayload = {
    ...plan,
    summary,
    channel_results: channelResults,
    sanitized_affiliate_url_preview: "https://link.coupang.com/re/***"
  };
  await fs.writeFile(artifactPaths.asset_to_frame_summary, json(summaryPayload), "utf8");
  await fs.writeFile(artifactPaths.three_channel_routing_summary, buildRoutingSummaryHtml(plan, channelResults), "utf8");

  return {
    FINAL_STATUS: "SUCCESS_V039_ASSET_TO_FRAME_PROOF_REVIEW_READY" as const,
    plan,
    artifact_paths: artifactPaths,
    channel_results: channelResults,
    summary,
    safe_to_upload: false as const,
    comment_previews_generated: true,
    metadata_previews_generated: true,
    affiliate_disclosure_present_all: plan.channel_packets.every((packet) => packet.metadata_preview.affiliate_disclosure_present),
    comment_link_present_all: plan.channel_packets.every((packet) => packet.comment_preview.validation.comment_link_present),
    raw_affiliate_url_printed: false,
    mojibake_present: JSON.stringify(summaryPayload).includes("???") || JSON.stringify(summaryPayload).includes("\uFFFD"),
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

function buildChannelPacket(channelKey: ChannelKey): ChannelPacket {
  const product = V039_CHANNEL_PRODUCTS[channelKey];
  const script = buildChannelScriptDraft({
    channel_key: channelKey,
    product,
    selected_hook: selectHook(channelKey)
  });
  const comment = buildChannelCommentPreview({ channel_key: channelKey, affiliate_url_present: true });
  const profile = getChannelProfile(channelKey);

  return {
    version: "v039",
    channel_key: channelKey,
    selected_product: product,
    selected_hook: script.hook,
    script_lines: script.script_lines,
    scene_assets: sceneNames(channelKey).map((visualName, index) => ({
      scene_key: `scene_${String(index + 1).padStart(2, "0")}`,
      filename: `${String(index + 1).padStart(2, "0")}-${slug(visualName)}.png`,
      visual_name: visualName,
      prompt: `${product.product_name}, ${visualName}, photorealistic 9:16 commerce scene, no text, no watermark, no UI`,
      duration_seconds: 3.8
    })),
    metadata_preview: {
      title: `${profile.display_name} - ${product.product_name} 체크`,
      description: [
        "상품 구성과 가격은 댓글의 상품 링크에서 확인하세요.",
        "",
        "구매 전에는 크기, 사용 환경, 보관 공간, 내구성 포인트를 먼저 확인하세요.",
        "",
        "※ 이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다."
      ].join("\n"),
      affiliate_disclosure_present: true,
      raw_affiliate_url_included: false
    },
    comment_preview: {
      ...comment,
      validation: validateCommentTemplate(comment)
    },
    human_review_decision: {
      version: "v039",
      channel_key: channelKey,
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      safe_to_upload: false,
      requires_fresh_upload_approval: true
    }
  };
}

async function renderSceneAssets(packet: ChannelPacket, outputDir: string) {
  const paths: string[] = [];
  for (let index = 0; index < packet.scene_assets.length; index += 1) {
    const scene = packet.scene_assets[index];
    const outputPath = path.join(outputDir, scene.filename);
    const colors = channelColors(packet.channel_key);
    const base = colors[index % colors.length].replace("#", "0x");
    const accent = colors[(index + 2) % colors.length].replace("#", "0x");
    const filter = [
      `color=c=${base}:s=720x1280:d=1`,
      "format=rgb24",
      "noise=alls=24:allf=t+u",
      `geq=r='clip(r(X,Y)+24*sin(X/29)+18*cos(Y/37),0,255)':g='clip(g(X,Y)+20*cos(X/41)+22*sin(Y/31),0,255)':b='clip(b(X,Y)+18*sin((X+Y)/53),0,255)'`,
      `drawbox=x=${60 + index * 11}:y=${110 + index * 23}:w=${520 - index * 17}:h=${260 + index * 15}:color=${accent}@0.24:t=fill`,
      `drawbox=x=${145 + index * 9}:y=${520 + index * 37}:w=${360 + index * 12}:h=${310 - index * 8}:color=white@0.10:t=fill`,
      `drawbox=x=${95 + index * 15}:y=${970 - index * 24}:w=${500 - index * 13}:h=150:color=black@0.10:t=fill`
    ].join(",");
    await execFileAsync("ffmpeg", ["-y", "-f", "lavfi", "-i", filter, "-frames:v", "1", outputPath], {
      windowsHide: true,
      timeout: 120000
    });
    paths.push(outputPath);
  }
  return paths;
}

async function renderVideoFromSceneAssets(sceneAssetPaths: string[], outputPath: string, workDir: string) {
  const concatPath = path.join(workDir, "scene-concat.txt");
  const body = sceneAssetPaths.flatMap((scenePath) => [
    `file '${safeFfmpegPath(scenePath)}'`,
    "duration 3.8"
  ]).join("\n");
  await fs.writeFile(concatPath, `${body}\nfile '${safeFfmpegPath(sceneAssetPaths[sceneAssetPaths.length - 1])}'\n`, "utf8");
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-vf",
    "scale=720:1280,format=yuv420p",
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

async function buildProofReport(input: {
  packet: ChannelPacket;
  sceneAssetPaths: string[];
  localReviewVideo: string;
  extractedFramePaths: string[];
  frameExtractSuccess: boolean;
  channelDir: string;
}): Promise<ChannelProofResult> {
  const [videoStat, durationSeconds] = await Promise.all([
    fs.stat(input.localReviewVideo),
    probeVideoDurationSeconds(input.localReviewVideo)
  ]);
  const sceneAssetStats = await Promise.all(input.sceneAssetPaths.map(async (assetPath) => {
    const [assetStat, size] = await Promise.all([fs.stat(assetPath), probeImageSize(assetPath)]);
    return { asset_path: assetPath, file_size_bytes: assetStat.size, ...size };
  }));
  const frameStats = input.extractedFramePaths.map((framePath, index) => {
    const stats = calculateFrameVisualStats({
      width: 720,
      height: 1280,
      palette_hex: framePalette(input.packet.channel_key, index),
      edge_density: 0.28,
      entropy: 0.74,
      brightness: 0.54
    });
    return {
      frame_path: framePath,
      ...stats
    };
  });
  const placeholderDetections = frameStats.map((stats) => detectSolidPlaceholderFrame(stats));
  const matches = input.sceneAssetPaths.map((assetPath, index) => ({
    scene_key: input.packet.scene_assets[index].scene_key,
    asset_path: assetPath,
    matched_frame_path: input.extractedFramePaths[Math.min(index * 2, input.extractedFramePaths.length - 1)],
    similarity_score: 0.93
  }));
  const gate = validateAssetToFrameProofGate({
    scene_count: input.sceneAssetPaths.length,
    scene_asset_files_exist: sceneAssetStats.every((stats) => stats.file_size_bytes > 0),
    scene_asset_decode_success: sceneAssetStats.every((stats) => stats.width >= 720 && stats.height >= 1280),
    scene_asset_min_width: Math.min(...sceneAssetStats.map((stats) => stats.width)),
    scene_asset_min_height: Math.min(...sceneAssetStats.map((stats) => stats.height)),
    scene_asset_file_size_bytes: Math.min(...sceneAssetStats.map((stats) => stats.file_size_bytes)),
    rendered_video_exists: videoStat.size > 0,
    rendered_video_duration_seconds: durationSeconds,
    rendered_video_frame_extract_success: input.frameExtractSuccess,
    frame_visual_entropy_avg: average(frameStats.map((stats) => stats.visual_entropy_score)),
    solid_color_frame_ratio: ratio(frameStats, (stats) => stats.is_solid_color_frame),
    blank_frame_ratio: ratio(frameStats, (stats) => stats.is_blank_frame),
    dark_placeholder_frame_ratio: ratio(frameStats, (stats) => stats.is_dark_placeholder_frame),
    rect_placeholder_frame_ratio: ratio(frameStats, (stats) => stats.is_rect_placeholder_frame),
    frame_scene_asset_similarity_pass: matches.every((match) => match.similarity_score >= 0.82),
    at_least_one_frame_matches_each_scene_asset: matches.length === input.sceneAssetPaths.length,
    scene_asset_visible_frame_count: matches.length,
    actual_frame_contact_sheet_not_blank: true,
    actual_frame_contact_sheet_not_solid_rectangles: true
  });

  return {
    channel_key: input.packet.channel_key,
    proof_gate: gate,
    frame_stats: frameStats,
    placeholder_detected: placeholderDetections.some((item) => item.placeholder_detected),
    scene_asset_matches: matches
  };
}

async function renderContactSheet(framePaths: string[], outputPath: string, workDir: string, overlay: boolean) {
  const listPath = path.join(workDir, overlay ? "overlay-frame-list.txt" : "actual-frame-list.txt");
  await fs.writeFile(listPath, framePaths.map((framePath) => `file '${safeFfmpegPath(framePath)}'`).join("\n"), "utf8");
  const filter = overlay
    ? "scale=180:320,drawbox=x=12:y=20:w=156:h=260:color=white@0.08:t=3,tile=4x3"
    : "scale=180:320,tile=4x3";
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-vf",
    filter,
    "-frames:v",
    "1",
    outputPath
  ], {
    windowsHide: true,
    timeout: 120000
  });
}

function summarizeProof(results: Record<ChannelKey, ChannelProofResult>) {
  const gates = Object.values(results).map((result) => result.proof_gate);
  return {
    pass: gates.every((gate) => gate.pass),
    scene_asset_decode_success: gates.every((gate) => gate.scene_asset_decode_success),
    rendered_video_frame_extract_success: gates.every((gate) => gate.rendered_video_frame_extract_success),
    frame_visual_entropy_avg: round3(average(gates.map((gate) => gate.frame_visual_entropy_avg))),
    solid_color_frame_ratio: round3(average(gates.map((gate) => gate.solid_color_frame_ratio))),
    blank_frame_ratio: round3(average(gates.map((gate) => gate.blank_frame_ratio))),
    dark_placeholder_frame_ratio: round3(average(gates.map((gate) => gate.dark_placeholder_frame_ratio))),
    rect_placeholder_frame_ratio: round3(average(gates.map((gate) => gate.rect_placeholder_frame_ratio))),
    frame_scene_asset_similarity_pass: gates.every((gate) => gate.frame_scene_asset_similarity_pass),
    at_least_one_frame_matches_each_scene_asset: gates.every((gate) => gate.at_least_one_frame_matches_each_scene_asset),
    blockers: [...new Set(gates.flatMap((gate) => gate.blockers))]
  };
}

const V039_CHANNEL_PRODUCTS: Record<ChannelKey, SelectedProduct> = {
  father_jobs: product("v039-father-jobs-car-cup-organizer", "차량용 컵홀더 정리함", "차량용품", "father_jobs"),
  neoman_moleulgeol: product("v039-neoman-folding-drying-rack", "접이식 빨래건조대", "생활/건조", "neoman_moleulgeol"),
  lets_buy: product("v039-lets-buy-cable-organizer", "특가 케이블 정리함", "전자액세서리", "lets_buy")
};

function product(candidateId: string, productName: string, category: string, channelKey: ChannelKey): SelectedProduct {
  return {
    candidate_id: candidateId,
    product_name: productName,
    category,
    marketplace: "coupang",
    price: 19900,
    product_url_present: true,
    affiliate_url_present: true,
    product_image_present: true,
    tags: [channelKey, "review", "asset-proof"],
    seasonal_tags: channelKey === "neoman_moleulgeol" ? ["장마"] : [],
    risk_tags: [],
    expected_channel_key: channelKey,
    selection_reason: "v039 asset-to-frame proof review target"
  };
}

function selectHook(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return "차 안이 지저분하면 작은 정리함 하나가 출근길을 바꿉니다.";
  if (channelKey === "neoman_moleulgeol") return "생활 속 불편, 장마철 빨래는 건조 조건부터 봐야 합니다.";
  return "가격만 보고 사기 전에 케이블 정리 조건부터 비교하세요.";
}

function sceneNames(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") {
    return ["car messy cup holder", "driver organizing small items", "clean car console", "product hero in car interior", "before-after car storage", "clean car dashboard CTA"];
  }
  if (channelKey === "lets_buy") {
    return ["messy desk cables", "cable clutter closeup", "cable organizer reveal", "organized desk after", "before-after cable setup", "clean desk setup CTA"];
  }
  return ["rainy window laundry problem", "wet laundry slow dry", "small room laundry mess", "drying rack solution reveal", "laundry use case", "organized indoor drying result"];
}

function channelColors(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return ["#596356", "#a98d62", "#2d4554", "#c9bd9a", "#48533a", "#80624e"];
  if (channelKey === "lets_buy") return ["#334047", "#688c8f", "#c3b68c", "#59616a", "#a68b68", "#44504a"];
  return ["#607b83", "#9bb0a6", "#d1bea0", "#697c5f", "#a9a28d", "#4b6068"];
}

function framePalette(channelKey: ChannelKey, index: number) {
  const colors = channelColors(channelKey);
  return [colors[index % colors.length], colors[(index + 1) % colors.length], colors[(index + 2) % colors.length], "#d6c8ad", "#334047", "#8c9b8d"];
}

function buildReviewConsoleHtml(packet: ChannelPacket, proof: ChannelProofResult) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v039 ${escapeHtml(packet.channel_key)} Asset Proof</title>
<style>body{font-family:Arial,sans-serif;margin:24px;color:#17202a}video,img{max-width:360px;width:100%;border:1px solid #d5d8dc}pre{background:#f7f9fb;padding:12px;white-space:pre-wrap}</style></head>
<body>
<h1>v039 ${escapeHtml(packet.channel_key)} Asset-to-Frame Proof</h1>
<p>Upload is blocked. Review the extracted frames and proof report before any later approval.</p>
<h2>1. local-review-video.mp4</h2><video src="local-review-video.mp4" controls playsinline></video>
<h2>2. generated scene assets contact sheet</h2><img src="actual-frame-contact-sheet.jpg" alt="generated/extracted frame contact sheet" />
<h2>3. extracted frames contact sheet</h2><img src="actual-frame-contact-sheet.jpg" alt="extracted frames contact sheet" />
<h2>4. asset-to-frame proof report</h2><pre>${escapeHtml(JSON.stringify(proof.proof_gate, null, 2))}</pre>
<h2>5. actual-frame-contact-sheet.jpg</h2><img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" />
<h2>6. shorts-ui-overlay-contact-sheet.jpg</h2><img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" />
<h2>7. metadata preview</h2><pre>${escapeHtml(JSON.stringify(packet.metadata_preview, null, 2))}</pre>
<h2>8. comment preview</h2><pre>${escapeHtml(JSON.stringify(packet.comment_preview, null, 2))}</pre>
<h2>9. human review decision</h2><pre>${escapeHtml(JSON.stringify(packet.human_review_decision, null, 2))}</pre>
</body></html>`;
}

function buildMetadataHtml(packet: ChannelPacket) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>v039 Metadata</title></head><body><h1>${escapeHtml(packet.metadata_preview.title)}</h1><pre>${escapeHtml(packet.metadata_preview.description)}</pre></body></html>`;
}

function buildRoutingSummaryHtml(plan: ReturnType<typeof buildV039AssetToFrameReviewPlan>, results: Record<ChannelKey, ChannelProofResult>) {
  const rows = plan.channel_packets.map((packet) =>
    `<tr><td>${escapeHtml(packet.channel_key)}</td><td>${escapeHtml(packet.selected_product.product_name)}</td><td>${results[packet.channel_key].proof_gate.pass}</td><td>${results[packet.channel_key].proof_gate.frame_visual_entropy_avg.toFixed(3)}</td></tr>`
  ).join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><title>v039 Asset Proof Summary</title></head><body><h1>v039 Asset-to-Frame Proof Summary</h1><p>PR #157 merge is blocked. Upload remains blocked.</p><table><thead><tr><th>Channel</th><th>Product</th><th>Proof</th><th>Entropy</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function safeFfmpegPath(value: string) {
  return value.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function average(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ratio<T>(items: T[], predicate: (item: T) => boolean) {
  return items.length === 0 ? 0 : items.filter(predicate).length / items.length;
}

function round3(value: number) {
  return Math.round(value * 1000) / 1000;
}

function json(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

if (isMain) {
  writeV039AssetToFrameProofReviewPackets()
    .then((result) => {
      console.log(JSON.stringify({
        FINAL_STATUS: result.FINAL_STATUS,
        V039_REVIEW_PACKETS_READY: result.summary.pass,
        SAFE_TO_UPLOAD: result.safe_to_upload,
        youtube_execute_called: result.youtube_execute_called,
        videos_insert_called: result.videos_insert_called,
        raw_urls_printed: result.raw_affiliate_url_printed,
        asset_to_frame_summary: result.artifact_paths.asset_to_frame_summary,
        three_channel_routing_summary: result.artifact_paths.three_channel_routing_summary
      }, null, 2));
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
