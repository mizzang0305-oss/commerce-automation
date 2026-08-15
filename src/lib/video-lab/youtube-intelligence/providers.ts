import type { CreativeEvidence, VisionEvidence, YouTubeSourceSnapshot, YouTubeTranscript } from "./types";

export interface CreativeIntelligenceModel {
  readonly enabled: boolean;
  analyze(input: {
    snapshot: YouTubeSourceSnapshot;
    transcript: YouTubeTranscript;
  }): Promise<CreativeEvidence>;
}

export class DisabledCreativeIntelligenceModel implements CreativeIntelligenceModel {
  readonly enabled = false;

  async analyze(_input: {
    snapshot: YouTubeSourceSnapshot;
    transcript: YouTubeTranscript;
  }): Promise<CreativeEvidence> {
    void _input;
    throw new Error("YOUTUBE_INTELLIGENCE_LLM_DISABLED");
  }
}

export interface VisionEvidenceProvider {
  readonly mode: "disabled" | "local_owner_frame";
  collect(snapshot: YouTubeSourceSnapshot): Promise<VisionEvidence[]>;
}

export class DisabledVisionEvidenceProvider implements VisionEvidenceProvider {
  readonly mode = "disabled" as const;

  async collect(_snapshot: YouTubeSourceSnapshot): Promise<VisionEvidence[]> {
    void _snapshot;
    throw new Error("YOUTUBE_REMOTE_FRAME_EXTRACTION_DISABLED");
  }
}

export class LocalOwnerFrameProvider implements VisionEvidenceProvider {
  readonly mode = "local_owner_frame" as const;

  constructor(private readonly evidenceByVideoId: ReadonlyMap<string, readonly VisionEvidence[]>) {}

  async collect(snapshot: YouTubeSourceSnapshot): Promise<VisionEvidence[]> {
    return (this.evidenceByVideoId.get(snapshot.videoId) ?? []).map((item) => ({
      ...item,
      provider: "local_owner_frame",
      rawMediaReuseAllowed: false,
    }));
  }
}
