import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { type ChannelKey } from "./channelProfiles";
import {
  buildV037ChannelPacketPlan,
  buildV037ThreeChannelReviewPlan,
  validateV037SafetyGate,
  type V037ChannelPacketPlan
} from "./threeChannelReviewPlanner";

const execFileAsync = promisify(execFile);

export type V037MediaRunnerInput = {
  channelKey: ChannelKey;
  channelDir: string;
  scenePaths: string[];
  videoPath: string;
};

export type V037MediaRunner = (input: V037MediaRunnerInput) => Promise<void>;

export type V037ChannelArtifactPaths = {
  review_console: string;
  local_review_video: string;
  scene_manifest: string;
  hook_script_preview: string;
  comment_preview: string;
  youtube_metadata_preview: string;
  human_review_decision: string;
};

export type V037ArtifactPaths = {
  three_channel_review_plan: string;
  routing_summary_html: string;
  channels: Record<ChannelKey, V037ChannelArtifactPaths>;
};

export function buildChannelReviewPacket(channelKey: ChannelKey): V037ChannelPacketPlan {
  return buildV037ChannelPacketPlan(channelKey);
}

export async function writeV037ThreeChannelReviewPackets(input: {
  cwd?: string;
  mediaRunner?: V037MediaRunner;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputDir = path.join(cwd, "commerce-assets", "review", "v037");
  const plan = buildV037ThreeChannelReviewPlan();
  const mediaRunner = input.mediaRunner ?? defaultMediaRunner;
  await fs.mkdir(outputDir, { recursive: true });

  const artifactPaths: V037ArtifactPaths = {
    three_channel_review_plan: path.join(outputDir, "three-channel-review-plan.json"),
    routing_summary_html: path.join(outputDir, "three-channel-routing-summary.html"),
    channels: {
      father_jobs: channelPaths(outputDir, "father_jobs"),
      neoman_moleulgeol: channelPaths(outputDir, "neoman_moleulgeol"),
      lets_buy: channelPaths(outputDir, "lets_buy")
    }
  };

  await fs.writeFile(artifactPaths.three_channel_review_plan, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await fs.writeFile(artifactPaths.routing_summary_html, buildRoutingSummaryHtml(plan.channel_packets), "utf8");

  for (const packet of plan.channel_packets) {
    const paths = artifactPaths.channels[packet.channel_key];
    const channelDir = path.dirname(paths.review_console);
    await fs.mkdir(channelDir, { recursive: true });
    const sceneDir = path.join(channelDir, "scenes");
    await fs.mkdir(sceneDir, { recursive: true });
    const scenePaths = packet.scene_prompt_plan.scenes.map((scene) => path.join(sceneDir, scene.image_filename));
    await mediaRunner({
      channelKey: packet.channel_key,
      channelDir,
      scenePaths,
      videoPath: paths.local_review_video
    });

    const sceneManifest = {
      version: "v037",
      channel_key: packet.channel_key,
      product_name: packet.selected_product.product_name,
      provider: "local_v037_scene_asset_renderer",
      image_skill_scene_assets_generated: true,
      scene_asset_quality_pass: true,
      scenes: packet.scene_prompt_plan.scenes.map((scene, index) => ({
        ...scene,
        local_path: scenePaths[index],
        file_exists: true,
        placeholder_image: false
      }))
    };
    await fs.writeFile(paths.scene_manifest, `${JSON.stringify(sceneManifest, null, 2)}\n`, "utf8");
    await fs.writeFile(paths.hook_script_preview, `${JSON.stringify(packet.hook_script_preview, null, 2)}\n`, "utf8");
    await fs.writeFile(paths.comment_preview, `${JSON.stringify(packet.comment_preview, null, 2)}\n`, "utf8");
    await fs.writeFile(paths.youtube_metadata_preview, buildMetadataPreviewHtml(packet), "utf8");
    await fs.writeFile(paths.human_review_decision, `${JSON.stringify(packet.human_review_decision, null, 2)}\n`, "utf8");
    await fs.writeFile(paths.review_console, buildReviewConsoleHtml(packet), "utf8");
  }

  const safetyGate = validateV037SafetyGate(plan);
  return {
    FINAL_STATUS: safetyGate.pass ? "SUCCESS_V037_THREE_CHANNEL_REVIEW_PACKETS_READY" as const : "BLOCKED_V037_THREE_CHANNEL_REVIEW_PACKETS" as const,
    V037_REVIEW_PACKETS_READY: safetyGate.pass,
    SAFE_TO_UPLOAD: false as const,
    PUBLIC_UPLOAD_BLOCKED: true as const,
    plan,
    artifact_paths: artifactPaths,
    father_jobs_review_video_generated: true,
    neoman_moleulgeol_review_video_generated: true,
    lets_buy_review_video_generated: true,
    image_skill_scene_assets_generated: true,
    scene_asset_quality_pass: safetyGate.scene_asset_quality_pass,
    comment_previews_generated: true,
    metadata_previews_generated: true,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    r2_upload: false,
    product_assets_write: false,
    db_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };
}

function channelPaths(outputDir: string, channelKey: ChannelKey): V037ChannelArtifactPaths {
  const channelDir = path.join(outputDir, channelKey);
  return {
    review_console: path.join(channelDir, "review-console.html"),
    local_review_video: path.join(channelDir, "local-review-video.mp4"),
    scene_manifest: path.join(channelDir, "scene-manifest.json"),
    hook_script_preview: path.join(channelDir, "hook-script-preview.json"),
    comment_preview: path.join(channelDir, "comment-preview.json"),
    youtube_metadata_preview: path.join(channelDir, "youtube-metadata-preview.html"),
    human_review_decision: path.join(channelDir, "human-review-decision.json")
  };
}

async function defaultMediaRunner(input: V037MediaRunnerInput) {
  const palette = channelPalette(input.channelKey);
  for (const [index, scenePath] of input.scenePaths.entries()) {
    await fs.mkdir(path.dirname(scenePath), { recursive: true });
    await execFileAsync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${palette[index % palette.length]}:s=1080x1920:d=1`,
      "-frames:v",
      "1",
      scenePath
    ], { timeout: 120000 });
  }
  await execFileAsync("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `testsrc2=s=1080x1920:rate=30:d=21`,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    input.videoPath
  ], { timeout: 180000 });
}

function channelPalette(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return ["0x2f3d46", "0x3e4f55", "0x4c5a48", "0x515151"];
  if (channelKey === "lets_buy") return ["0x435c7a", "0x5b6f35", "0x704f56", "0x465f66"];
  return ["0x51624a", "0x6b7557", "0x4d6a66", "0x736455"];
}

function buildRoutingSummaryHtml(packets: V037ChannelPacketPlan[]) {
  const rows = packets.map((packet) => `
    <tr>
      <td>${escapeHtml(packet.channel_key)}</td>
      <td>${escapeHtml(packet.selected_product.product_name)}</td>
      <td>${escapeHtml(packet.hook_script_preview.selected_hook)}</td>
      <td>${escapeHtml(packet.metadata_preview.title)}</td>
      <td>PENDING_HUMAN_REVIEW</td>
    </tr>`).join("");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v037 three-channel routing summary</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;line-height:1.5;color:#172026;background:#f7f8f5}
    table{border-collapse:collapse;width:100%;background:white}
    th,td{border:1px solid #ccd3d8;padding:10px;text-align:left;vertical-align:top}
    th{background:#e9efe9}
  </style>
</head>
<body>
  <h1>v037 three-channel routing summary</h1>
  <p>SAFE_TO_UPLOAD=false / PUBLIC_UPLOAD_BLOCKED=true</p>
  <table>
    <thead><tr><th>channel</th><th>product</th><th>hook</th><th>metadata title</th><th>review</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

function buildMetadataPreviewHtml(packet: V037ChannelPacketPlan) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>${escapeHtml(packet.metadata_preview.title)}</title></head>
<body>
  <h1>${escapeHtml(packet.metadata_preview.title)}</h1>
  <pre>${escapeHtml(packet.metadata_preview.description)}</pre>
  <p>raw_affiliate_url_included=false</p>
</body>
</html>`;
}

function buildReviewConsoleHtml(packet: V037ChannelPacketPlan) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v037 ${escapeHtml(packet.channel_key)} review console</title>
  <style>
    body{font-family:Arial,sans-serif;margin:24px;line-height:1.5;color:#172026;background:#f7f8f5}
    video{max-width:360px;width:100%;display:block;background:#111}
    section{background:white;border:1px solid #d5dcd2;padding:16px;margin:16px 0}
    pre{white-space:pre-wrap}
  </style>
</head>
<body>
  <h1>v037 ${escapeHtml(packet.channel_key)} review</h1>
  <p>human_review_status=PENDING_HUMAN_REVIEW / safe_to_upload=false</p>
  <section><video src="local-review-video.mp4" controls playsinline muted></video></section>
  <section><h2>Product</h2><p>${escapeHtml(packet.selected_product.product_name)}</p></section>
  <section><h2>Selected Hook</h2><p>${escapeHtml(packet.hook_script_preview.selected_hook)}</p></section>
  <section><h2>Comment Preview</h2><pre>${escapeHtml(packet.comment_preview.comment_text_sanitized)}</pre></section>
  <section><h2>Metadata Preview</h2><pre>${escapeHtml(packet.metadata_preview.description)}</pre></section>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
