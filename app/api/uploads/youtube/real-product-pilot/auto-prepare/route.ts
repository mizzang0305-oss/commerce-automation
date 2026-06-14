import { NextResponse } from "next/server";

import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import {
  buildRealProductAutoPilot,
  REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS,
  type RealProductAutoPilotMode
} from "@/lib/uploads/youtube/realProductAutoPilotBuilder";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const mode = normalizeMode(body.mode);
  const requestedVisibility = normalizeVisibility(body.visibility);

  try {
    const repository = getAutomationRepository();
    const [candidates, queueItems, productAssets] = await Promise.all([
      repository.getProductCandidates(),
      repository.getQueue(),
      repository.getProductAssets()
    ]);
    const result = buildRealProductAutoPilot({
      mode,
      requested_visibility: requestedVisibility,
      candidates,
      queueItems,
      productAssets
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    console.error("[uploads.youtube.real_product_auto_pilot] prepare failed", {
      message: error instanceof Error ? error.message : "unknown_error"
    });
    return NextResponse.json(
      {
        ok: false,
        error_code: "REAL_PRODUCT_AUTO_PILOT_FAILED",
        message: "Real product auto pilot prepare failed with a safe server error.",
        mode,
        selected_product: null,
        prepared_video_asset_ref: null,
        prepared_video_asset_summary: null,
        package_prepare: null,
        blocked_reasons: ["safe_server_error"],
        next_auto_action: "CHECK_SERVER_LOGS_WITHOUT_PRINTING_SECRETS",
        side_effects: REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS
      },
      { status: 500 }
    );
  }
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeMode(value: unknown): RealProductAutoPilotMode {
  return value === "prepare_only" ? "prepare_only" : "dry_run";
}

function normalizeVisibility(value: unknown) {
  if (value === "unlisted") {
    return "unlisted";
  }
  if (value === "public") {
    return "public";
  }
  return "private";
}
