import type { ResolvedInputAsset } from "@/lib/local-slideshow-execution/resolveInputAssets";

export function buildFfmpegArgs(inputAssets: ResolvedInputAsset[], outputVideoPath: string) {
  const durationPerSlide = Math.max(2, Math.ceil(15 / inputAssets.length));
  const args = ["-hide_banner", "-loglevel", "error", "-y"];

  for (const asset of inputAssets) {
    args.push("-loop", "1", "-t", String(durationPerSlide), "-i", asset.absolute_path);
  }

  const filterParts = inputAssets.map((_, index) => (
    `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${index}]`
  ));
  const concatInputs = inputAssets.map((_, index) => `[v${index}]`).join("");
  filterParts.push(`${concatInputs}concat=n=${inputAssets.length}:v=1:a=0[outv]`);

  args.push(
    "-filter_complex",
    filterParts.join(";"),
    "-map",
    "[outv]",
    "-r",
    "30",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputVideoPath
  );

  return args;
}
