import type { MotionEffect, RenderRequest } from "@/video/contracts/renderer";

export type PhotoToShortScene = {
  index: number;
  image_path: string;
  duration_seconds: number;
  effect: MotionEffect;
  caption: string;
};

export type PhotoToShortPlan = {
  version: "1.0";
  width: 1080;
  height: 1920;
  fps: 30;
  target_duration_seconds: number;
  scenes: PhotoToShortScene[];
  voiceover_required: false;
  remote_download_allowed: false;
};

const EFFECTS: MotionEffect[] = [
  "slow_push_in",
  "pan_left_to_right",
  "slow_pull_out",
  "pan_right_to_left",
  "static_hold"
];

export function buildPhotoToShortPlan(request: RenderRequest): PhotoToShortPlan {
  const imageCount = request.product_images.length;
  const base = request.target_duration_seconds / imageCount;
  const captions = request.subtitle_lines.length > 0
    ? request.subtitle_lines
    : [request.hook, request.title, request.cta];
  let allocated = 0;
  const scenes = request.product_images.map((image, index) => {
    const isLast = index === imageCount - 1;
    const duration = isLast
      ? request.target_duration_seconds - allocated
      : roundMillis(base);
    allocated += duration;
    return {
      index: index + 1,
      image_path: image.path,
      duration_seconds: roundMillis(duration),
      effect: EFFECTS[index % EFFECTS.length] ?? "static_hold",
      caption: captions[index % captions.length] ?? request.title
    };
  });
  return {
    version: "1.0",
    width: 1080,
    height: 1920,
    fps: 30,
    target_duration_seconds: request.target_duration_seconds,
    scenes,
    voiceover_required: false,
    remote_download_allowed: false
  };
}

function roundMillis(value: number) {
  return Math.round(value * 1000) / 1000;
}
