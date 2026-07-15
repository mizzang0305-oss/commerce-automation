import { z } from "zod";

export const rendererNameSchema = z.enum(["legacy", "video_use"]);
export const rendererModeSchema = z.enum(["legacy", "video_use", "shadow"]);
export const motionEffectSchema = z.enum([
  "slow_push_in",
  "slow_pull_out",
  "pan_left_to_right",
  "pan_right_to_left",
  "static_hold"
]);

export const renderImageSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

export const renderRequestSchema = z.object({
  job_id: z.string().min(1),
  product_id: z.string().min(1),
  campaign_id: z.string().min(1),
  source_timestamp: z.string().datetime().nullable().default(null),
  title: z.string().min(1),
  subtitle_lines: z.array(z.string().min(1)).default([]),
  hook: z.string().min(1),
  cta: z.string().min(1),
  disclosure: z.string().min(1),
  product_images: z.array(renderImageSchema).min(1).max(12),
  logo_asset: z.string().min(1).nullable().default(null),
  bgm_asset: z.string().min(1).nullable().default(null),
  voiceover_asset: z.string().min(1).nullable().default(null),
  target_duration_seconds: z.number().positive().max(120),
  aspect_ratio: z.literal("9:16").default("9:16"),
  width: z.literal(1080).default(1080),
  height: z.literal(1920).default(1920),
  fps: z.literal(30).default(30),
  template_id: z.string().min(1),
  output_directory: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).default({})
});

export type RendererName = z.infer<typeof rendererNameSchema>;
export type RendererMode = z.infer<typeof rendererModeSchema>;
export type MotionEffect = z.infer<typeof motionEffectSchema>;
export type RenderImage = z.infer<typeof renderImageSchema>;
export type RenderRequest = z.infer<typeof renderRequestSchema>;

export type MediaQualityEvidence = {
  status: "PASS" | "FAIL";
  width: number | null;
  height: number | null;
  fps: number | null;
  duration_seconds: number | null;
  video_codec: string | null;
  pixel_format: string | null;
  audio_codec: string | null;
  audio_stream_present: boolean;
  faststart: boolean;
  black_frame_detected: boolean;
  warnings: string[];
  blockers: string[];
};

export type RenderResult = {
  success: boolean;
  renderer_name: RendererName;
  renderer_version: string;
  upstream_commit: string | null;
  output_video_path: string | null;
  preview_video_path: string | null;
  thumbnail_path: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  video_codec: string | null;
  audio_codec: string | null;
  file_size_bytes: number | null;
  source_hash: string;
  render_manifest_path: string | null;
  quality_report_path: string | null;
  quality: MediaQualityEvidence;
  warnings: string[];
  errors: string[];
  elapsed_seconds: number;
  live_upload_attempted: false;
  production_db_write_attempted: false;
};

export interface VideoRenderer {
  readonly name: RendererName;
  readonly version: string;
  render(request: RenderRequest): Promise<RenderResult>;
}

export type ShadowRenderResult = {
  mode: "shadow";
  legacy: RenderResult;
  video_use: RenderResult;
  safe_to_publish: false;
  live_upload_attempted: false;
  comparison_only: true;
  preferred_publish_renderer: "legacy";
  warnings: string[];
};

export type RendererExecutionResult =
  | { mode: "legacy" | "video_use"; result: RenderResult; fallback_used: boolean; safe_to_publish: false }
  | ShadowRenderResult;
