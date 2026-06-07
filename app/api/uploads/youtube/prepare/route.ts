import { NextResponse } from "next/server";
import { buildYouTubeUploadRequest, youtubeUploadSafeSideEffects } from "@/lib/uploads/youtube";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const result = buildYouTubeUploadRequest(body);

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
        message: "YouTube upload request is missing required private/unlisted upload inputs.",
        missing_reasons: result.missing_reasons,
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    request: result.request,
    side_effects: youtubeUploadSafeSideEffects,
    approval_required: true
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
