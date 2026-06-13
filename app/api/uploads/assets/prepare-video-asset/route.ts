import { NextResponse } from "next/server";
import {
  toPreparedVideoAssetApiSummary,
  validatePreparedVideoAssetRef
} from "@/lib/uploads/assets/preparedVideoAsset";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const result = validatePreparedVideoAssetRef(body);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: result.error_code,
        message: "Prepared video asset is not ready for domain upload.",
        blocked_reasons: result.blocked_reasons,
        safe_display: result.safe_display,
        side_effects: result.side_effects
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    asset_ref: toPreparedVideoAssetApiSummary(result.asset_ref, result.safe_display),
    safe_display: result.safe_display,
    side_effects: result.side_effects
  });
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
