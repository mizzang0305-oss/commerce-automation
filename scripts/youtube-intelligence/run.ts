import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  runYouTubeIntelligenceCommand,
  type YouTubeIntelligenceCommand,
} from "../../src/lib/video-lab/youtube-intelligence";

void main();

async function main(): Promise<void> {
  const command = process.argv[2] as YouTubeIntelligenceCommand | undefined;
  if (!command || !["fixture", "analyze", "report"].includes(command)) {
    throw new Error("YOUTUBE_INTELLIGENCE_COMMAND_REQUIRED:fixture|analyze|report");
  }

  const inputPath = optionValue("--input");
  if (command !== "fixture" && !inputPath) {
    throw new Error("YOUTUBE_INTELLIGENCE_LOCAL_INPUT_REQUIRED:--input");
  }

  const inputText = inputPath ? await readFile(path.resolve(inputPath), "utf8") : undefined;
  const now = new Date().toISOString();
  const runId = `ytci-${now.replace(/[^0-9]/g, "").slice(0, 17)}`;
  const result = runYouTubeIntelligenceCommand({
    command,
    ...(inputText ? { inputText } : {}),
    runId,
    startedAt: now,
    finishedAt: now,
  });

  const outputRoot = path.resolve(process.cwd(), "data", "youtube-intelligence-v1", "derived");
  await mkdir(outputRoot, { recursive: true });
  const outputPath = path.join(outputRoot, `${command}-${runId}.json`);
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  process.stdout.write(
    `${JSON.stringify({ command, outputPath, liveIngestCalls: 0, videoDownloads: 0, audioDownloads: 0, remoteFrameExtraction: 0, cookieUsage: 0, modelCalls: 0, visionCalls: 0 })}\n`,
  );
}

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
