import { NextResponse } from "next/server";

import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getOneProductLocalVideoGenerator } from "@/lib/uploads/videoAssets/oneProductLocalVideoGenerator";
import {
  buildOneProductVideoAssetEntryPoint,
  ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS,
  type OneProductVideoAssetMode
} from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await readJson(request);
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error_code: "INVALID_JSON",
        message: "One-product video asset request JSON could not be parsed.",
        blocked_reasons: ["invalid_json"],
        side_effects: { ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS }
      },
      { status: 400 }
    );
  }

  const candidateId = typeof body.candidate_id === "string" ? body.candidate_id.trim() : "";
  if (!candidateId) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "REAL_PRODUCT_CANDIDATE_NOT_READY",
        message: "candidate_id is required.",
        blocked_reasons: ["candidate_id_required"],
        side_effects: { ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS }
      },
      { status: 400 }
    );
  }

  try {
    const repository = getAutomationRepository();
    const [candidates, productAssets] = await Promise.all([
      repository.getProductCandidates(),
      repository.getProductAssets()
    ]);
    const result = await buildOneProductVideoAssetEntryPoint({
      mode: normalizeMode(body.mode),
      candidate_id: candidateId,
      approval: typeof body.approval === "string" ? body.approval : "",
      candidates,
      productAssets,
      prepared_video_asset: body.prepared_video_asset,
      localVideoGenerator: getOneProductLocalVideoGenerator()
    });

    return NextResponse.json(result, { status: result.ok ? 200 : statusForError(result.error_code) });
  } catch (error) {
    console.error("[uploads.youtube.real_product_video_asset] prepare failed", {
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: "ONE_PRODUCT_VIDEO_ASSET_FAILED",
        message: "One-product video asset entrypoint failed with a safe server error.",
        blocked_reasons: ["safe_server_error"],
        side_effects: { ...ONE_PRODUCT_VIDEO_ASSET_SAFE_SIDE_EFFECTS }
      },
      { status: 500 }
    );
  }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) {
    return {};
  }
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}

function normalizeMode(value: unknown): OneProductVideoAssetMode {
  if (value === "generate_local_only" || value === "register_server_asset") {
    return value;
  }
  return "dry_run";
}

function statusForError(errorCode: string | null) {
  if (errorCode === "REAL_PRODUCT_CANDIDATE_NOT_READY") {
    return 404;
  }
  return 400;
}
