import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  CreativeEvidence,
  CreativePattern,
  YouTubeIntelligenceRun,
  YouTubeSourceSnapshot,
  YouTubeTranscript,
} from "./types";

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

export class JsonYouTubeIntelligenceStore {
  constructor(private readonly root: string) {
    if (!path.isAbsolute(root)) throw new Error("YOUTUBE_INTELLIGENCE_STORE_ROOT_MUST_BE_ABSOLUTE");
  }

  async saveNormalizedIndex(
    snapshot: YouTubeSourceSnapshot,
    transcript: YouTubeTranscript,
  ): Promise<string> {
    assertVideoId(snapshot.videoId);
    const target = this.resolveWithin("normalized", `${snapshot.videoId}.json`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeJson(target, {
      snapshot,
      transcriptIndex: {
        sourceId: transcript.sourceId,
        videoId: transcript.videoId,
        segmentCount: transcript.segments.length,
        transcriptFingerprint: transcript.transcriptFingerprint,
        textRetained: false,
      },
    });
    return target;
  }

  async saveDerivedEvidence(evidence: CreativeEvidence): Promise<string> {
    assertVideoId(evidence.videoId);
    const target = this.resolveWithin("derived", `${evidence.videoId}.json`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeJson(target, evidence);
    return target;
  }

  async savePatternIndex(patterns: readonly CreativePattern[]): Promise<string> {
    const target = this.resolveWithin("index", "patterns.json");
    await mkdir(path.dirname(target), { recursive: true });
    await writeJson(target, patterns);
    return target;
  }

  async saveRun(run: YouTubeIntelligenceRun): Promise<string> {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(run.runId)) {
      throw new Error("YOUTUBE_INTELLIGENCE_RUN_ID_INVALID");
    }
    const target = this.resolveWithin("index", `run-${run.runId}.json`);
    await mkdir(path.dirname(target), { recursive: true });
    await writeJson(target, run);
    return target;
  }

  private resolveWithin(layer: "normalized" | "derived" | "index", name: string): string {
    const root = path.resolve(this.root);
    const target = path.resolve(root, layer, name);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error("YOUTUBE_INTELLIGENCE_STORE_PATH_ESCAPE");
    }
    return target;
  }
}

async function writeJson(target: string, value: unknown): Promise<void> {
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "w" });
}

function assertVideoId(videoId: string): void {
  if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error("YOUTUBE_VIDEO_ID_INVALID");
}
