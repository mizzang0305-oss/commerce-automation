import fs from "node:fs/promises";
import { resolveAllowedLocalRenderPath, toRepoRelativeLocalRenderPath } from "@/lib/local-slideshow-execution/allowedLocalPaths";
import type { LocalSlideshowRenderPackage } from "@/lib/local-slideshow-render";

export interface ResolvedInputAsset {
  requested_path: string;
  absolute_path: string;
  repo_relative_path: string;
}

export interface ResolveInputAssetsResult {
  ok: boolean;
  assets: ResolvedInputAsset[];
  warnings: string[];
  blocked_reason?: string;
}

function extractPackageImagePaths(renderPackage: LocalSlideshowRenderPackage) {
  return renderPackage.slideshow_package_plan.timeline
    .map((item) => item.image_path_reference)
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

export async function resolveInputAssets(
  renderPackage: LocalSlideshowRenderPackage,
  explicitInputImagePaths: string[] = []
): Promise<ResolveInputAssetsResult> {
  const requestedPaths = explicitInputImagePaths.length > 0 ? explicitInputImagePaths : extractPackageImagePaths(renderPackage);
  const warnings: string[] = [];

  if (requestedPaths.length < 3) {
    return {
      ok: false,
      assets: [],
      warnings,
      blocked_reason: "At least three local image paths are required for slideshow rendering."
    };
  }

  const assets: ResolvedInputAsset[] = [];
  for (const requestedPath of requestedPaths) {
    const absolutePath = resolveAllowedLocalRenderPath(requestedPath);
    if (!absolutePath) {
      return {
        ok: false,
        assets: [],
        warnings,
        blocked_reason: `Input image path is outside the allowed local render folders: ${requestedPath}`
      };
    }
    try {
      const stat = await fs.stat(absolutePath);
      if (!stat.isFile()) {
        return {
          ok: false,
          assets: [],
          warnings,
          blocked_reason: `Input image path is not a file: ${requestedPath}`
        };
      }
    } catch {
      return {
        ok: false,
        assets: [],
        warnings,
        blocked_reason: `Input image file does not exist: ${requestedPath}`
      };
    }
    assets.push({
      requested_path: requestedPath,
      absolute_path: absolutePath,
      repo_relative_path: toRepoRelativeLocalRenderPath(absolutePath)
    });
  }

  return { ok: true, assets, warnings };
}
