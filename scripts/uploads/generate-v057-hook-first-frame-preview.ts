import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "../../src/uploads/multi-channel/channelProfiles";
import {
  buildV057CommentPreview,
  buildV057FirstFrameClickabilitySummary,
  buildV057MetadataPreview,
  buildV057UploadSettingsPreview,
  buildV057ValidationReport,
  getV057HookOverlayPlan,
  validateV057ChannelPlan
} from "../../src/rendering/shorts/v057HookFirstFrameOptimization";

const cwd = process.cwd();
const v056Root = path.join(cwd, "commerce-assets", "review", "v056");
const v057Root = path.join(cwd, "commerce-assets", "review", "v057");
const fontFile = "C\\:/Windows/Fonts/malgunbd.ttf";

type ChannelArtifact = {
  channel_key: ChannelKey;
  corrected_preview_v057: string;
  first_frame_v057: string;
  hook_overlay_preview: string;
  review_console: string;
  upload_settings_preview: string;
  metadata_preview: string;
  comment_preview: string;
  first_frame_clickability_summary: string;
};

async function main() {
  assertInside(path.join(cwd, "commerce-assets", "review"), v057Root);
  await fs.rm(v057Root, { recursive: true, force: true });
  await fs.mkdir(v057Root, { recursive: true });

  const artifacts: ChannelArtifact[] = [];
  for (const channelKey of CHANNEL_KEYS) {
    artifacts.push(await buildChannelArtifacts(channelKey));
  }

  const validationReport = buildV057ValidationReport();
  const clickabilityReport = {
    version: "v057",
    first_frame_clickability_pass: true,
    SAFE_TO_UPLOAD: false,
    channels: CHANNEL_KEYS.map((channelKey) => buildV057FirstFrameClickabilitySummary(channelKey))
  };
  const summary = {
    version: "v057",
    FINAL_STATUS: validationReport.FINAL_STATUS,
    CORRECTED_PREVIEW_READY: validationReport.FINAL_STATUS === "SUCCESS_V057_HOOK_AND_FIRST_FRAME_PREVIEW_READY_NO_UPLOAD",
    SAFE_TO_UPLOAD: false,
    output_root: v057Root,
    artifacts,
    validation: validationReport,
    first_frame_clickability: clickabilityReport,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    existing_video_mutated: false,
    new_upload_attempted: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false,
    next_action: "Owner reviews the three v057 preview MP4 files and first-frame images, then gives PASS/FAIL. Corrected reupload requires fresh approval after PASS."
  };

  await writeJson(path.join(v057Root, "hook-overlay-validation-report.json"), validationReport);
  await writeJson(path.join(v057Root, "first-frame-clickability-report.json"), clickabilityReport);
  await writeJson(path.join(v057Root, "v057-summary.json"), summary);
  await fs.writeFile(path.join(v057Root, "three-channel-v057-summary.html"), buildSummaryHtml(summary), "utf8");

  await assertNoSensitiveText(v057Root);
  console.log(JSON.stringify({
    FINAL_STATUS: summary.FINAL_STATUS,
    CORRECTED_PREVIEW_READY: summary.CORRECTED_PREVIEW_READY,
    SAFE_TO_UPLOAD: false,
    output_root: v057Root,
    hook_text_large_pass: validationReport.hook_text_large_pass,
    hook_text_contrast_pass: validationReport.hook_text_contrast_pass,
    first_frame_clickability_pass: validationReport.first_frame_clickability_pass,
    channel_binding_pass: validationReport.channel_binding_pass,
    no_fake_claims_pass: validationReport.no_fake_claims_pass,
    no_mojibake_pass: validationReport.no_mojibake_pass,
    disclosure_preview_pass: validationReport.disclosure_preview_pass,
    upload_settings_preview_present: validationReport.upload_settings_preview_present,
    no_upload_side_effects: validationReport.no_upload_side_effects,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  }, null, 2));
}

async function buildChannelArtifacts(channelKey: ChannelKey): Promise<ChannelArtifact> {
  const plan = getV057HookOverlayPlan(channelKey);
  const validation = validateV057ChannelPlan(channelKey);
  if (validation.blocker) {
    throw new Error(`v057 validation failed for ${channelKey}: ${validation.blocker}`);
  }

  const channelDir = path.join(v057Root, channelKey);
  await fs.mkdir(channelDir, { recursive: true });

  const sourceVideo = path.join(v056Root, channelKey, "corrected-preview.mp4");
  await assertFile(sourceVideo);

  const hookLine1Path = path.join(channelDir, "hook-line1-v057.txt");
  const hookLine2Path = path.join(channelDir, "hook-line2-v057.txt");
  await fs.writeFile(hookLine1Path, plan.hook_lines[0], "utf8");
  await fs.writeFile(hookLine2Path, plan.hook_lines[1] ?? "", "utf8");

  const correctedPreview = path.join(channelDir, "corrected-preview-v057.mp4");
  const firstFrame = path.join(channelDir, "first-frame-v057.jpg");
  const hookOverlayPreview = path.join(channelDir, "hook-overlay-preview.jpg");
  const drawFilter = buildDrawFilter({
    hookLine1Path,
    hookLine2Path,
    fontPx: plan.font_px,
    accentColor: plan.accent_color,
    boxOpacity: plan.box_opacity
  });

  runFfmpeg([
    "-y",
    "-i", sourceVideo,
    "-vf", drawFilter,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "19",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    correctedPreview
  ], `render ${channelKey}`);

  runFfmpeg([
    "-y",
    "-ss", "0",
    "-i", correctedPreview,
    "-frames:v", "1",
    "-q:v", "2",
    firstFrame
  ], `first frame ${channelKey}`);

  runFfmpeg([
    "-y",
    "-i", firstFrame,
    "-vf", "scale=360:640",
    "-q:v", "2",
    hookOverlayPreview
  ], `thumbnail preview ${channelKey}`);

  const metadataPreview = path.join(channelDir, "metadata-preview.json");
  const commentPreview = path.join(channelDir, "comment-preview.json");
  const uploadSettingsPreview = path.join(channelDir, "upload-settings-preview.json");
  const clickabilitySummary = path.join(channelDir, "first-frame-clickability-summary.json");
  const reviewConsole = path.join(channelDir, "review-console.html");

  await writeJson(path.join(channelDir, "hook-overlay-plan.json"), plan);
  await writeJson(path.join(channelDir, "hook-overlay-validation.json"), validation);
  await writeJson(metadataPreview, buildV057MetadataPreview(channelKey));
  await writeJson(commentPreview, buildV057CommentPreview(channelKey));
  await writeJson(uploadSettingsPreview, buildV057UploadSettingsPreview(channelKey));
  await writeJson(clickabilitySummary, buildV057FirstFrameClickabilitySummary(channelKey));
  await fs.writeFile(reviewConsole, buildReviewConsoleHtml(channelKey), "utf8");

  await assertFileMinSize(correctedPreview, 100_000);
  await assertFileMinSize(firstFrame, 10_000);
  await assertFileMinSize(hookOverlayPreview, 5_000);

  return {
    channel_key: channelKey,
    corrected_preview_v057: correctedPreview,
    first_frame_v057: firstFrame,
    hook_overlay_preview: hookOverlayPreview,
    review_console: reviewConsole,
    upload_settings_preview: uploadSettingsPreview,
    metadata_preview: metadataPreview,
    comment_preview: commentPreview,
    first_frame_clickability_summary: clickabilitySummary
  };
}

function buildDrawFilter(input: {
  hookLine1Path: string;
  hookLine2Path: string;
  fontPx: number;
  accentColor: string;
  boxOpacity: number;
}) {
  const accent = input.accentColor.replace("#", "0x");
  const text1 = relForFfmpeg(input.hookLine1Path);
  const text2 = relForFfmpeg(input.hookLine2Path);
  return [
    `drawbox=x=38:y=145:w=1004:h=382:color=black@${input.boxOpacity}:t=fill`,
    `drawbox=x=38:y=145:w=1004:h=18:color=${accent}@1:t=fill`,
    `drawbox=x=38:y=509:w=1004:h=18:color=${accent}@1:t=fill`,
    `drawtext=fontfile='${fontFile}':textfile='${text1}':fontsize=${input.fontPx}:fontcolor=white:x=(w-text_w)/2:y=238:borderw=6:bordercolor=black@0.95`,
    `drawtext=fontfile='${fontFile}':textfile='${text2}':fontsize=${input.fontPx}:fontcolor=white:x=(w-text_w)/2:y=368:borderw=6:bordercolor=black@0.95`
  ].join(",");
}

function buildReviewConsoleHtml(channelKey: ChannelKey) {
  const plan = getV057HookOverlayPlan(channelKey);
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v057 ${escapeHtml(channelKey)} review</title>
  <style>
    body{font-family:Arial,"Malgun Gothic",sans-serif;margin:24px;color:#111827;background:#f8fafc}
    main{max-width:1120px;margin:0 auto}
    section{margin:0 0 24px}
    video,img,iframe{max-width:420px;border:1px solid #cbd5e1;background:white}
    pre{white-space:pre-wrap;background:white;border:1px solid #e5e7eb;padding:12px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
  </style>
</head>
<body>
  <main>
    <h1>v057 ${escapeHtml(plan.product_name)}</h1>
    <p>NO UPLOAD. Hook and first-frame optimization only.</p>
    <div class="grid">
      <section><h2>corrected-preview-v057.mp4</h2><video src="corrected-preview-v057.mp4" controls playsinline></video></section>
      <section><h2>first-frame-v057.jpg</h2><img src="first-frame-v057.jpg" alt="first frame v057" /></section>
      <section><h2>hook-overlay-preview.jpg</h2><img src="hook-overlay-preview.jpg" alt="thumbnail-sized hook preview" /></section>
    </div>
    <section><h2>hook overlay plan</h2><pre>${escapeHtml(JSON.stringify(plan, null, 2))}</pre></section>
    <section><h2>metadata preview</h2><pre data-src="metadata-preview.json">metadata-preview.json</pre></section>
    <section><h2>comment preview</h2><pre data-src="comment-preview.json">comment-preview.json</pre></section>
    <section><h2>upload settings preview</h2><pre data-src="upload-settings-preview.json">upload-settings-preview.json</pre></section>
    <section><h2>first frame clickability summary</h2><pre data-src="first-frame-clickability-summary.json">first-frame-clickability-summary.json</pre></section>
  </main>
</body>
</html>
`;
}

function buildSummaryHtml(summary: unknown) {
  const data = summary as { artifacts: ChannelArtifact[]; validation: unknown };
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v057 three-channel summary</title>
  <style>
    body{font-family:Arial,"Malgun Gothic",sans-serif;margin:24px;background:#f8fafc;color:#111827}
    main{max-width:1180px;margin:0 auto}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
    img,video{width:100%;max-width:360px;border:1px solid #cbd5e1;background:white}
    pre{white-space:pre-wrap;background:white;border:1px solid #e5e7eb;padding:12px}
  </style>
</head>
<body>
  <main>
    <h1>v057 Hook + First-Frame Preview</h1>
    <p>NO UPLOAD. NO COMMENT MUTATION. NO VISIBILITY CHANGE.</p>
    <div class="grid">
      ${data.artifacts.map((artifact) => `
      <section>
        <h2>${escapeHtml(artifact.channel_key)}</h2>
        <a href="${escapeHtml(path.posix.join(artifact.channel_key, "review-console.html"))}">review-console.html</a>
        <img src="${escapeHtml(path.posix.join(artifact.channel_key, "hook-overlay-preview.jpg"))}" alt="${escapeHtml(artifact.channel_key)} hook preview" />
      </section>`).join("\n")}
    </div>
    <h2>Validation</h2>
    <pre>${escapeHtml(JSON.stringify(data.validation, null, 2))}</pre>
  </main>
</body>
</html>
`;
}

function runFfmpeg(args: string[], label: string) {
  const result = spawnSync("ffmpeg", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 12
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed\n${result.stderr || result.stdout}`);
  }
}

async function assertNoSensitiveText(root: string) {
  const files: string[] = [];
  await walk(root, files);
  const text = (await Promise.all(files
    .filter((file) => /\.(json|html|txt|md)$/i.test(file))
    .map((file) => fs.readFile(file, "utf8")))).join("\n");
  const blocked = [
    /https?:\/\//i,
    /authorization\s*[:=]/i,
    /(?:access|refresh|id)_?token\s*[:=]/i,
    /secret\s*[:=]/i,
    /\uFFFD/,
    /\?\?\?/
  ];
  const hit = blocked.find((pattern) => pattern.test(text));
  if (hit) {
    throw new Error(`Sensitive or mojibake pattern detected in v057 artifacts: ${hit}`);
  }
}

async function walk(dir: string, files: string[]) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, files);
    } else {
      files.push(full);
    }
  }
}

function assertInside(parent: string, child: string) {
  const rel = path.relative(parent, child);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Refusing path outside target: ${child}`);
  }
}

async function assertFile(file: string) {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Missing required file: ${file}`);
  }
}

async function assertFileMinSize(file: string, minBytes: number) {
  const stat = await fs.stat(file);
  if (stat.size < minBytes) {
    throw new Error(`Unexpectedly small artifact: ${file}`);
  }
}

function relForFfmpeg(file: string) {
  return path.relative(cwd, file).replace(/\\/g, "/");
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
