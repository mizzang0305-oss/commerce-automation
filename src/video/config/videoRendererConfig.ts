import path from "node:path";
import { rendererModeSchema, type RendererMode } from "@/video/contracts/renderer";

export const VIDEO_USE_PINNED_COMMIT = "92c2b34e44c205cbc2acae7f6ca7c1c219d5dd66";

export type VideoRendererConfig = {
  renderer: RendererMode;
  videoUseEnabled: boolean;
  videoUsePath: string;
  videoUseCommit: string;
  renderTimeoutMs: number;
  keepIntermediate: boolean;
  allowTts: boolean;
  allowRemoteDownload: boolean;
  previewOnly: boolean;
  liveUpload: false;
  productionDbWrite: false;
};

export function loadVideoRendererConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd()
): VideoRendererConfig {
  const requested = rendererModeSchema.safeParse((env.VIDEO_RENDERER || "legacy").trim().toLowerCase());
  const timeoutSeconds = boundedNumber(env.VIDEO_USE_RENDER_TIMEOUT_SECONDS, 300, 30, 1800);
  return {
    renderer: requested.success ? requested.data : "legacy",
    videoUseEnabled: readBoolean(env.VIDEO_USE_ENABLED, false),
    videoUsePath: path.resolve(env.VIDEO_USE_PATH?.trim() || path.join(cwd, ".tools", "video-use")),
    videoUseCommit: env.VIDEO_USE_COMMIT?.trim() || VIDEO_USE_PINNED_COMMIT,
    renderTimeoutMs: timeoutSeconds * 1000,
    keepIntermediate: readBoolean(env.VIDEO_USE_KEEP_INTERMEDIATE, false),
    allowTts: readBoolean(env.VIDEO_USE_ALLOW_TTS, false),
    allowRemoteDownload: readBoolean(env.VIDEO_USE_ALLOW_REMOTE_DOWNLOAD, false),
    previewOnly: readBoolean(env.VIDEO_USE_PREVIEW_ONLY, true),
    liveUpload: false,
    productionDbWrite: false
  };
}

function readBoolean(value: string | undefined, fallback: boolean) {
  if (!value?.trim()) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}
