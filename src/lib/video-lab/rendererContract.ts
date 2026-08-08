import type { CaptionCue } from "./captionTimeline";

export type VideoLabRendererRequest = {
  candidate_id: string;
  width: 1080;
  height: 1920;
  fps: 30;
  captions: CaptionCue[];
  local_asset_paths: string[];
  local_audio_path: string;
  output_path: string;
};

export type VideoLabRendererResult =
  | {
      status: "disabled";
      renderer: "disabled";
      reason: "NOT_CONFIGURED";
      output_path: null;
      upload_called: false;
    }
  | {
      status: "rendered";
      renderer: "remotion_experimental";
      output_path: string;
      upload_called: false;
    };

export type RendererReadiness = {
  renderer: "disabled" | "remotion_experimental";
  status: "NOT_CONFIGURED" | "READY_EXPERIMENTAL";
  configured: boolean;
};

export interface ExperimentalRenderer {
  readonly name: "disabled" | "remotion_experimental";
  inspect(): Promise<RendererReadiness>;
  render(request: VideoLabRendererRequest): Promise<VideoLabRendererResult>;
}

export type VideoLabRenderer = ExperimentalRenderer;

export class DisabledVideoLabRenderer implements ExperimentalRenderer {
  readonly name = "disabled" as const;

  async inspect(): Promise<RendererReadiness> {
    return { renderer: "disabled", status: "NOT_CONFIGURED", configured: false };
  }

  async render(request: VideoLabRendererRequest): Promise<VideoLabRendererResult> {
    void request;
    return {
      status: "disabled",
      renderer: "disabled",
      reason: "NOT_CONFIGURED",
      output_path: null,
      upload_called: false
    };
  }
}

export type ExperimentalRemotionAdapter = (
  request: Readonly<VideoLabRendererRequest>
) => Promise<{ output_path: string }>;

export class ExperimentalRemotionRenderer implements ExperimentalRenderer {
  readonly name = "remotion_experimental" as const;

  constructor(private readonly adapter: ExperimentalRemotionAdapter) {}

  async inspect(): Promise<RendererReadiness> {
    return {
      renderer: "remotion_experimental",
      status: "READY_EXPERIMENTAL",
      configured: true
    };
  }

  async render(request: VideoLabRendererRequest): Promise<VideoLabRendererResult> {
    validateRequest(request);
    const result = await this.adapter(request);
    if (!result.output_path || result.output_path !== request.output_path) {
      throw new Error("VIDEO_LAB_RENDER_OUTPUT_BINDING_FAILED");
    }
    return {
      status: "rendered",
      renderer: "remotion_experimental",
      output_path: result.output_path,
      upload_called: false
    };
  }
}

function validateRequest(request: VideoLabRendererRequest): void {
  if (request.width !== 1080 || request.height !== 1920 || request.fps !== 30) {
    throw new Error("VIDEO_LAB_RENDER_PROFILE_REQUIRED");
  }
  if (!request.candidate_id.trim() || !request.output_path.trim()) {
    throw new Error("VIDEO_LAB_RENDER_BINDING_REQUIRED");
  }
  if (!request.local_audio_path.trim() || request.local_asset_paths.length === 0) {
    throw new Error("VIDEO_LAB_LOCAL_MEDIA_REQUIRED");
  }
  if (request.captions.length === 0) throw new Error("VIDEO_LAB_CAPTIONS_REQUIRED");
}
