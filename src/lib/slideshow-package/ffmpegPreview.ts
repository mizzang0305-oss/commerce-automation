import type { SlideshowTimelineItem } from "@/lib/slideshow-package/types";

export function buildFfmpegCommandPreview(timeline: SlideshowTimelineItem[], outputFilename: string) {
  const inputs = timeline
    .map((item) => `-loop 1 -t ${item.duration_sec} -i "${item.image_path_reference || `<${item.asset_type}>`}"`)
    .join(" ");
  const filters = timeline
    .map((item, index) => `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`)
    .join(";");
  const concatInputs = timeline.map((_, index) => `[v${index}]`).join("");

  return [
    "# Preview only. Copy this text to a separately approved local render environment.",
    "# Do not execute FFmpeg from the WebApp.",
    `ffmpeg -y ${inputs} -filter_complex "${filters};${concatInputs}concat=n=${timeline.length}:v=1:a=0[outv]" -map "[outv]" -r 30 -pix_fmt yuv420p "${outputFilename}"`
  ].join("\n");
}
