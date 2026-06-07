import type { LocalSlideshowRenderPackage } from "@/lib/local-slideshow-render";
import type { LocalSlideshowRenderEnginePreference } from "@/lib/local-slideshow-execution/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asLocalSlideshowRenderPackage(value: unknown): LocalSlideshowRenderPackage | null {
  if (!isRecord(value)) {
    return null;
  }
  if (value.mode !== "local_slideshow_render_bridge") {
    return null;
  }
  if (!isRecord(value.slideshow_package_plan)) {
    return null;
  }
  return value as unknown as LocalSlideshowRenderPackage;
}

export function asEnginePreference(value: unknown): LocalSlideshowRenderEnginePreference {
  return value === "ffmpeg" || value === "moviepy" || value === "auto" ? value : "auto";
}

export function asInputImagePaths(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}
