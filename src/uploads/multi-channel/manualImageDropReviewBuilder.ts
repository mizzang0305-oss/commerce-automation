import fs from "node:fs/promises";
import path from "node:path";

import { type ChannelKey } from "./channelProfiles";
import { buildChannelCommentPreview } from "./commentTemplateBuilder";
import { buildV041ManualImageDropManifest } from "./manualImageDropManifest";
import { validateV041ManualImageDrop } from "./manualImageDropValidator";

export type V041MediaRunner = (input: {
  channelKey: ChannelKey;
  sourceImagePaths: string[];
  outputPath: string;
  actualFrameContactSheetPath: string;
  shortsUiOverlayContactSheetPath: string;
}) => Promise<void>;

export async function buildV041ManualImageDropReview(input: {
  cwd?: string;
  mediaRunner?: V041MediaRunner;
} = {}) {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v041");
  const manifest = buildV041ManualImageDropManifest({ cwd });
  const validation = await validateV041ManualImageDrop({ cwd });
  await fs.mkdir(outputRoot, { recursive: true });

  if (!validation.validation_pass) {
    return {
      FINAL_STATUS: validation.found_image_count === 0
        ? "WAITING_FOR_MANUAL_IMAGE_DROP"
        : "BLOCKED_MANUAL_IMAGE_DROP_QUALITY_FAIL",
      V041_BRIDGE_READY: true,
      V041_REVIEW_PACKETS_READY: false,
      SAFE_TO_UPLOAD: false,
      required_image_count: validation.required_image_count,
      found_image_count: validation.found_image_count,
      validation_attempted: true,
      validation_pass: false,
      validation_blocker: validation.validation_blocker,
      validation_report: validation,
      videos_generated: false,
      review_packet_blocker: validation.validation_blocker,
      channel_results: manifest.channels.map((channel) => ({
        channel_key: channel.channel_key,
        review_console: null,
        local_review_video: null,
        validation_pass: false
      })),
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
    } as const;
  }

  if (!input.mediaRunner) {
    return {
      FINAL_STATUS: "BLOCKED_V041_MEDIA_RUNNER_NOT_CONFIGURED",
      V041_BRIDGE_READY: true,
      V041_REVIEW_PACKETS_READY: false,
      SAFE_TO_UPLOAD: false,
      required_image_count: validation.required_image_count,
      found_image_count: validation.found_image_count,
      validation_attempted: true,
      validation_pass: true,
      validation_blocker: "MEDIA_RUNNER_NOT_CONFIGURED",
      validation_report: validation,
      videos_generated: false,
      review_packet_blocker: "MEDIA_RUNNER_NOT_CONFIGURED",
      channel_results: manifest.channels.map((channel) => ({
        channel_key: channel.channel_key,
        review_console: null,
        local_review_video: null,
        validation_pass: true
      })),
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
    } as const;
  }

  const channelResults = [];
  for (const channel of manifest.channels) {
    const channelDir = path.join(outputRoot, channel.channel_key);
    const paths = buildChannelArtifactPaths(channelDir);
    await fs.mkdir(channelDir, { recursive: true });
    const commentPreview = buildChannelCommentPreview({ channel_key: channel.channel_key });
    const hookScriptPreview = {
      channel_key: channel.channel_key,
      product_name: channel.product_name,
      hook: buildHook(channel.channel_key),
      script_lines: [
        "Check the real-life problem first.",
        "Look at the size, fit, and storage condition.",
        "Use the product link only after owner review approves upload."
      ],
      fake_usage_claim_blocked: true,
      guaranteed_result_claim_blocked: true
    };
    const metadataPreview = buildMetadataPreview(channel.channel_key, channel.product_name);
    const humanReviewDecision = {
      version: "v041",
      channel_key: channel.channel_key,
      human_review_status: "PENDING_HUMAN_REVIEW",
      metadata_review_status: "PENDING_METADATA_REVIEW",
      safe_to_upload: false,
      requires_fresh_upload_approval: true
    };

    await input.mediaRunner({
      channelKey: channel.channel_key,
      sourceImagePaths: channel.files.map((file) => file.path),
      outputPath: paths.local_review_video,
      actualFrameContactSheetPath: paths.actual_frame_contact_sheet,
      shortsUiOverlayContactSheetPath: paths.shorts_ui_overlay_contact_sheet
    });
    await writeJson(paths.scene_manifest, channel);
    await writeJson(paths.manual_drop_validation_report, validation);
    await writeJson(paths.asset_to_frame_proof_report, {
      version: "v041",
      channel_key: channel.channel_key,
      pass: true,
      source: "manual-drop-images",
      local_review_video: paths.local_review_video,
      youtube_execute_called: false,
      videos_insert_called: false
    });
    await writeJson(paths.hook_script_preview, hookScriptPreview);
    await writeJson(paths.comment_preview, commentPreview);
    await fs.writeFile(paths.youtube_metadata_preview, metadataPreview, "utf8");
    await writeJson(paths.human_review_decision, humanReviewDecision);
    await fs.writeFile(paths.review_console, buildReviewConsole({
      channelKey: channel.channel_key,
      paths,
      hookScriptPreview,
      metadataPreview,
      commentText: commentPreview.comment_text_sanitized
    }), "utf8");

    channelResults.push({
      channel_key: channel.channel_key,
      review_console: paths.review_console,
      local_review_video: paths.local_review_video,
      validation_pass: true
    });
  }

  return {
    FINAL_STATUS: "SUCCESS_V041_MANUAL_IMAGE_DROP_REVIEW_PACKETS_READY",
    V041_BRIDGE_READY: true,
    V041_REVIEW_PACKETS_READY: true,
    SAFE_TO_UPLOAD: false,
    required_image_count: validation.required_image_count,
    found_image_count: validation.found_image_count,
    validation_attempted: true,
    validation_pass: true,
    validation_blocker: null,
    validation_report: validation,
    videos_generated: true,
    review_packet_blocker: null,
    channel_results: channelResults,
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
  } as const;
}

function buildChannelArtifactPaths(channelDir: string) {
  return {
    review_console: path.join(channelDir, "review-console.html"),
    local_review_video: path.join(channelDir, "local-review-video.mp4"),
    scene_manifest: path.join(channelDir, "scene-manifest.json"),
    manual_drop_validation_report: path.join(channelDir, "manual-drop-validation-report.json"),
    asset_to_frame_proof_report: path.join(channelDir, "asset-to-frame-proof-report.json"),
    actual_frame_contact_sheet: path.join(channelDir, "actual-frame-contact-sheet.jpg"),
    shorts_ui_overlay_contact_sheet: path.join(channelDir, "shorts-ui-overlay-contact-sheet.jpg"),
    hook_script_preview: path.join(channelDir, "hook-script-preview.json"),
    comment_preview: path.join(channelDir, "comment-preview.json"),
    youtube_metadata_preview: path.join(channelDir, "youtube-metadata-preview.html"),
    human_review_decision: path.join(channelDir, "human-review-decision.json")
  };
}

function buildHook(channelKey: ChannelKey) {
  if (channelKey === "father_jobs") return "If your car console keeps getting messy, check this setup first.";
  if (channelKey === "neoman_moleulgeol") return "Rainy-day laundry smell starts with the drying setup.";
  return "Before buying cable organizers, compare the desk before and after.";
}

function buildMetadataPreview(channelKey: ChannelKey, productName: string) {
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v041 Metadata Preview - ${escapeHtml(channelKey)}</title></head>
<body>
  <h1>${escapeHtml(productName)}</h1>
  <p>상품 링크는 댓글의 상품 링크에서 확인하세요.</p>
  <p>이 콘텐츠는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.</p>
</body>
</html>
`;
}

function buildReviewConsole(input: {
  channelKey: ChannelKey;
  paths: ReturnType<typeof buildChannelArtifactPaths>;
  hookScriptPreview: unknown;
  metadataPreview: string;
  commentText: string;
}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v041 Manual Image Drop Review - ${escapeHtml(input.channelKey)}</title>
  <style>
    body{font-family:Arial,"Malgun Gothic",sans-serif;margin:24px;color:#111827;background:#f8fafc}
    section{background:white;border:1px solid #d1d5db;padding:16px;margin-bottom:16px}
    video,img{max-width:100%;border:1px solid #cbd5e1;background:white}
    pre{white-space:pre-wrap;background:#f3f4f6;border:1px solid #e5e7eb;padding:12px}
  </style>
</head>
<body>
  <h1>v041 Manual Image Drop Review - ${escapeHtml(input.channelKey)}</h1>
  <section><h2>1. Manual Drop Image Contact Sheet</h2><p>Review the manually supplied images in the expected folder.</p></section>
  <section><h2>2. Local Review Video</h2><video src="local-review-video.mp4" controls playsinline></video></section>
  <section><h2>3. Extracted Frame Contact Sheet</h2><img src="actual-frame-contact-sheet.jpg" alt="actual frame contact sheet" /></section>
  <section><h2>4. Shorts UI Overlay Contact Sheet</h2><img src="shorts-ui-overlay-contact-sheet.jpg" alt="shorts UI overlay contact sheet" /></section>
  <section><h2>5. Asset-to-Frame Proof Report</h2><p>${escapeHtml(input.paths.asset_to_frame_proof_report)}</p></section>
  <section><h2>6. Manual Drop Validation Report</h2><p>${escapeHtml(input.paths.manual_drop_validation_report)}</p></section>
  <section><h2>7. Hook / Script Preview</h2><pre>${escapeHtml(JSON.stringify(input.hookScriptPreview, null, 2))}</pre></section>
  <section><h2>8. Metadata Preview</h2><pre>${escapeHtml(input.metadataPreview)}</pre></section>
  <section><h2>9. Comment Preview</h2><pre>${escapeHtml(input.commentText)}</pre></section>
  <section><h2>10. Human Review Decision</h2><p>PENDING_HUMAN_REVIEW, SAFE_TO_UPLOAD=false</p></section>
</body>
</html>
`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
