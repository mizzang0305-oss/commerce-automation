import fs from "node:fs/promises";
import path from "node:path";
import type { LocalSlideshowExecutionResult } from "@/lib/local-slideshow-execution/types";
import type { ResolvedInputAsset } from "@/lib/local-slideshow-execution/resolveInputAssets";

export async function writeRenderManifest({
  candidateId,
  inputAssets,
  outputVideoPath,
  outputManifestPath,
  engine
}: {
  candidateId: string;
  inputAssets: ResolvedInputAsset[];
  outputVideoPath: string;
  outputManifestPath: string;
  engine: string;
}) {
  await fs.mkdir(path.dirname(outputManifestPath), { recursive: true });
  await fs.writeFile(
    outputManifestPath,
    JSON.stringify({
      candidate_id: candidateId,
      mode: "local_slideshow_render_execution",
      render_engine: engine,
      output_video_path: outputVideoPath,
      input_images: inputAssets.map((asset) => asset.repo_relative_path),
      created_at: new Date().toISOString()
    }, null, 2),
    "utf8"
  );
}

export async function writeRenderReport(outputReportPath: string, result: LocalSlideshowExecutionResult) {
  await fs.mkdir(path.dirname(outputReportPath), { recursive: true });
  await fs.writeFile(outputReportPath, JSON.stringify(result, null, 2), "utf8");
}
