import { NextResponse } from "next/server";

import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import {
  buildRealProductAutoPilot,
  REAL_PRODUCT_AUTO_PILOT_SIDE_EFFECTS,
  type RealProductAutoPilotMode
} from "@/lib/uploads/youtube/realProductAutoPilotBuilder";
import type { CoupangScoutDiagnostic } from "@/lib/coupang/scoutCompatibility";

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
      productAssets,
      scout_diagnostic: normalizeScoutDiagnostic(body.scout_diagnostic)
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

function normalizeScoutDiagnostic(value: unknown): CoupangScoutDiagnostic | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Partial<CoupangScoutDiagnostic>;
  if (record.ok !== false || typeof record.classification !== "string") {
    return null;
  }
  if (!record.classification.startsWith("COUPANG_SCOUT_")) {
    return null;
  }
  if (!isAllowedScoutErrorClassification(record.classification)) {
    return null;
  }
  const blockedReasons = Array.isArray(record.blocked_reasons)
    ? record.blocked_reasons.filter((item): item is string => typeof item === "string")
    : [];
  return {
    ok: false,
    classification: record.classification as CoupangScoutDiagnostic["classification"],
    safe_error: typeof record.safe_error === "string" ? record.safe_error : "Coupang scout request failed with a safe classified error.",
    endpoint_family: record.endpoint_family === "seller_openapi" || record.endpoint_family === "partners_affiliate"
      ? record.endpoint_family
      : "unknown",
    method: "GET",
    blocked_reasons: blockedReasons.length > 0 ? blockedReasons : [record.classification.toLowerCase()],
    next_auto_action: typeof record.next_auto_action === "string" ? record.next_auto_action : "FIX_COUPANG_SCOUT_REQUEST_CONTRACT",
    external_call_allowed: false,
    keyword_policy: {
      raw_keyword_printed: false,
      normalized_keyword_present: Boolean(record.keyword_policy?.normalized_keyword_present),
      encoded_keyword_present: Boolean(record.keyword_policy?.encoded_keyword_present),
      attempts_bounded: true,
      max_attempts: 3
    },
    keyword_attempts: [],
    side_effects: {
      youtube_execute_called: false,
      db_written: false,
      r2_uploaded: false,
      queue_created: false
    }
  };
}

function isAllowedScoutErrorClassification(value: string): value is Exclude<CoupangScoutDiagnostic["classification"], "COUPANG_SCOUT_READY"> {
  return [
    "COUPANG_SCOUT_ENDPOINT_FAMILY_MISMATCH",
    "COUPANG_SCOUT_KEYWORD_INVALID",
    "COUPANG_SCOUT_KEYWORD_ENCODING_INVALID",
    "COUPANG_SCOUT_KEYWORD_POLICY_INVALID",
    "COUPANG_SCOUT_CREDENTIAL_NOT_ELIGIBLE",
    "COUPANG_SCOUT_AUTH_SIGNATURE_INVALID",
    "COUPANG_SCOUT_AUTH_SIGNATURE_EXPIRED",
    "COUPANG_SCOUT_AUTH_IP_NOT_ALLOWED",
    "COUPANG_SCOUT_RESPONSE_CONTRACT_MISMATCH",
    "COUPANG_SCOUT_API_ERROR",
    "COUPANG_SCOUT_UNKNOWN_400"
  ].includes(value);
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
