import "server-only";

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { loadVideoRendererConfig } from "../../src/video/config/videoRendererConfig";
import { LegacyPhotoRenderer } from "../../src/video/renderers/legacyRenderer";
import { VideoUsePhotoRenderer } from "../../src/video/renderers/videoUseRenderer";
import { executeRenderer } from "../../src/video/rendererOrchestrator";

const run = promisify(execFile);

async function main() {
  const cwd = process.cwd();
  const root = path.join(cwd, "artifacts", "video-use-comparison");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(root, { recursive: true });
  const scenarios = [
    { name: "single-image-15s", imageCount: 1, duration: 15 },
    { name: "three-images-20s", imageCount: 3, duration: 20 },
    { name: "six-images-30s", imageCount: 6, duration: 30 }
  ];
  const reports = [];
  for (const scenario of scenarios) {
    reports.push(await renderScenario(root, scenario));
  }
  const summary = {
    mode: "shadow",
    scenarios: reports,
    all_legacy_success: reports.every((report) => report.legacy_success),
    all_video_use_success: reports.every((report) => report.video_use_success),
    safe_to_publish: false,
    live_upload_attempted: false,
    comparison_only: true,
    secrets_printed: false
  };
  await fs.writeFile(path.join(root, "comparison.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(root, "index.html"), buildHtml(summary), "utf8");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (!summary.all_legacy_success || !summary.all_video_use_success) process.exitCode = 1;
}

async function renderScenario(
  root: string,
  scenario: { name: string; imageCount: number; duration: number }
) {
  const outputRoot = path.join(root, scenario.name);
  const imagesDir = path.join(outputRoot, "fixtures");
  await fs.mkdir(imagesDir, { recursive: true });
  const colors = ["0x2563eb", "0x16a34a", "0xdc2626", "0x9333ea", "0xea580c", "0x0891b2"];
  const images: string[] = [];
  for (const [index, color] of colors.slice(0, scenario.imageCount).entries()) {
    const target = path.join(imagesDir, `product-${index + 1}.png`);
    await run("ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=${color}:s=1080x1920:d=0.1`,
      "-frames:v", "1", target
    ], { timeout: 30_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
    images.push(target);
  }
  const config = loadVideoRendererConfig({
    ...process.env,
    VIDEO_RENDERER: "shadow",
    VIDEO_USE_ENABLED: "true",
    VIDEO_USE_PATH: process.env.VIDEO_USE_PATH,
    VIDEO_USE_PREVIEW_ONLY: "true",
    LIVE_UPLOAD: "false"
  }, process.cwd());
  const request = {
    job_id: `video-use-smoke-${scenario.name}`,
    product_id: "fixture-product",
    campaign_id: "fixture-campaign",
    source_timestamp: "2026-07-12T00:00:00.000Z",
    title: "\uC0C1\uD488 \uC0AC\uC9C4 \uC601\uC0C1 \uD14C\uC2A4\uD2B8",
    subtitle_lines: [
      "\uC0C1\uD488 \uD575\uC2EC \uC774\uBBF8\uC9C0",
      "\uAD6C\uC131\uACFC \uC0AC\uC6A9 \uC870\uAC74 \uD655\uC778",
      "\uC0C1\uD488 \uB9C1\uD06C\uB294 \uC124\uBA85\uB780 \uD655\uC778"
    ],
    hook: "\uC0AC\uC9C4\uC73C\uB85C \uD655\uC778\uD558\uB294 \uC0C1\uD488",
    cta: "\uC0C1\uD488 \uB9C1\uD06C\uB294 \uC124\uBA85\uB780 \uD655\uC778",
    disclosure: "\uCFE0\uD321 \uD30C\uD2B8\uB108\uC2A4 \uD65C\uB3D9\uC73C\uB85C \uC218\uC218\uB8CC\uB97C \uC81C\uACF5\uBC1B\uC744 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
    product_images: images.map((image) => ({ path: image })),
    logo_asset: null,
    bgm_asset: null,
    voiceover_asset: null,
    target_duration_seconds: scenario.duration,
    aspect_ratio: "9:16" as const,
    width: 1080 as const,
    height: 1920 as const,
    fps: 30 as const,
    template_id: "photo-to-short-shadow-v1",
    output_directory: outputRoot,
    metadata: { fixture: true, live_upload: false }
  };
  const result = await executeRenderer({
    request,
    config,
    legacyRenderer: new LegacyPhotoRenderer(),
    videoUseRenderer: new VideoUsePhotoRenderer(config)
  });
  if (result.mode !== "shadow") throw new Error("SHADOW_RESULT_REQUIRED");
  const report = {
    scenario: scenario.name,
    image_count: scenario.imageCount,
    target_duration_seconds: scenario.duration,
    mode: result.mode,
    legacy_success: result.legacy.success,
    video_use_success: result.video_use.success,
    legacy_elapsed_seconds: result.legacy.elapsed_seconds,
    video_use_elapsed_seconds: result.video_use.elapsed_seconds,
    legacy_file_size: result.legacy.file_size_bytes,
    video_use_file_size: result.video_use.file_size_bytes,
    legacy_quality: result.legacy.quality.status,
    video_use_quality: result.video_use.quality.status,
    safe_to_publish: result.safe_to_publish,
    live_upload_attempted: result.live_upload_attempted,
    comparison_only: result.comparison_only,
    secrets_printed: false
  };
  await fs.writeFile(path.join(outputRoot, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function buildHtml(report: { scenarios: Array<{ scenario: string }> }) {
  const sections = report.scenarios.map((scenario) => `<section><h2>${escapeHtml(scenario.scenario)}</h2><h3>Legacy</h3><video controls width="360" src="${escapeHtml(scenario.scenario)}/legacy/final.mp4"></video><h3>video-use</h3><video controls width="360" src="${escapeHtml(scenario.scenario)}/video-use/edit/final.mp4"></video></section>`).join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Renderer shadow comparison</title></head><body><h1>Legacy vs video-use</h1><p>comparison_only=true</p><p>live_upload_attempted=false</p>${sections}<pre>${escapeHtml(JSON.stringify(report, null, 2))}</pre></body></html>`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

main().catch((error) => {
  process.stdout.write(`${JSON.stringify({
    mode: "shadow",
    status: "blocked",
    blocker: error instanceof Error && /^[A-Z0-9_]+$/.test(error.message) ? error.message : "VIDEO_USE_SMOKE_SAFE_FAILURE",
    live_upload_attempted: false,
    secrets_printed: false,
    fake_success: false
  }, null, 2)}\n`);
  process.exitCode = 1;
});
