import type { SlideshowTimelineItem } from "@/lib/slideshow-package/types";

export function buildMoviePyScriptPreview(timeline: SlideshowTimelineItem[], outputFilename: string) {
  const clipLines = timeline.map(
    (item, index) =>
      `clip_${index} = ImageClip(${JSON.stringify(item.image_path_reference || `<${item.asset_type}>`)}).with_duration(${item.duration_sec}).resized(height=1920)`
  );
  const clipNames = timeline.map((_, index) => `clip_${index}`).join(", ");

  return [
    "# Preview only. Do not execute inside the WebApp.",
    "# Copy to a separately approved local render environment after manual QA.",
    "from moviepy import ImageClip, concatenate_videoclips",
    "",
    ...clipLines,
    `video = concatenate_videoclips([${clipNames}], method="compose")`,
    `video.write_videofile(${JSON.stringify(outputFilename)}, fps=30, codec="libx264", audio=False)`
  ].join("\n");
}
