import { NextResponse } from "next/server";
import {
  YOUTUBE_PRODUCT_VIDEO_PACKAGE_SIDE_EFFECTS,
  buildYouTubeProductVideoUploadPackage
} from "@/lib/uploads/youtube/productVideoUploadPackage";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const result = buildYouTubeProductVideoUploadPackage(body);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_PRODUCT_UPLOAD_PACKAGE_NOT_READY",
        message: "YouTube product video private package is not ready.",
        blocked_reasons: result.blocked_reasons,
        readiness: result.readiness,
        side_effects: result.side_effects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    package: result.package,
    readiness: result.package.readiness,
    side_effects: YOUTUBE_PRODUCT_VIDEO_PACKAGE_SIDE_EFFECTS,
    approval_required: true,
    execute_in_this_pr: false
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
