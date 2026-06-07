import type { ResolvedInputAsset } from "@/lib/local-slideshow-execution/resolveInputAssets";

function pyString(value: string) {
  return JSON.stringify(value);
}

export function buildMoviePyScript(inputAssets: ResolvedInputAsset[], outputVideoPath: string) {
  const durationPerSlide = Math.max(2, Math.ceil(15 / inputAssets.length));
  const imagePaths = inputAssets.map((asset) => asset.absolute_path);

  return [
    "from moviepy import ImageClip, concatenate_videoclips",
    `image_paths = ${JSON.stringify(imagePaths)}`,
    `duration = ${durationPerSlide}`,
    "clips = []",
    "for image_path in image_paths:",
    "    clip = ImageClip(image_path).with_duration(duration).resized(height=1920)",
    "    clip = clip.with_position('center')",
    "    clips.append(clip)",
    "video = concatenate_videoclips(clips, method='compose')",
    `video.write_videofile(${pyString(outputVideoPath)}, fps=30, codec='libx264', audio=False)`,
    "video.close()",
    "for clip in clips:",
    "    clip.close()"
  ].join("\n");
}
