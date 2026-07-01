import fs from "node:fs/promises";
import path from "node:path";

import { buildV054RuntimeYouTubeAdapterReadiness } from "../../src/uploads/multi-channel/v054RuntimeYouTubeAdapterFactory";

async function main() {
  const report = await buildV054RuntimeYouTubeAdapterReadiness({
    cwd: process.cwd()
  });
  await writeArtifacts(process.cwd(), report);
  console.log(JSON.stringify(report, null, 2));

  if (report.FINAL_STATUS !== "SUCCESS_V054_RUNTIME_YOUTUBE_ADAPTERS_READY_NO_UPLOAD") {
    process.exitCode = 1;
  }
}

async function writeArtifacts(cwd: string, report: unknown) {
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v054");
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.writeFile(
    path.join(outputRoot, "runtime-youtube-adapter-readiness.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(outputRoot, "runtime-youtube-adapter-readiness.html"),
    buildHtml(report),
    "utf8"
  );
}

function buildHtml(report: unknown) {
  const value = report as Record<string, unknown>;
  return `<!doctype html>
<html lang="ko">
<head><meta charset="utf-8" /><title>v054 runtime YouTube adapter readiness</title></head>
<body>
  <h1>v054 runtime YouTube adapter readiness</h1>
  <p>FINAL_STATUS=${escapeHtml(value.FINAL_STATUS)}</p>
  <p>V054_RUNTIME_ADAPTERS_READY=${escapeHtml(value.V054_RUNTIME_ADAPTERS_READY)}</p>
  <p>CHANNEL_ROUTING_READY=${escapeHtml(value.CHANNEL_ROUTING_READY)}</p>
  <p>SAFE_TO_UPLOAD=false</p>
  <p>videos_insert_called=false</p>
  <p>comment_create_update_delete_called=false</p>
</body>
</html>
`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v054 runtime YouTube adapter readiness failed");
  process.exitCode = 1;
});
