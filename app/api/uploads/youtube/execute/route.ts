import { NextResponse } from "next/server";
import {
  ServerYouTubeUploadAdapter,
  buildYouTubeUploadReadiness,
  buildYouTubeUploadRequest,
  hasExactYouTubeUploadConfirmation,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";
import { blockedYouTubeUploadResult } from "@/lib/uploads/youtube/youtubeUploadErrors";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const requestResult = buildYouTubeUploadRequest(body);
  const visibility = body.visibility === "unlisted" ? "unlisted" : "private";

  if (!hasExactYouTubeUploadConfirmation(body.confirmation)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BLOCKED_BY_CONFIRMATION",
        message: "Exact YouTube private/unlisted upload confirmation is required.",
        result: blockedYouTubeUploadResult(
          visibility,
          "YouTube upload was not attempted because the confirmation phrase did not match.",
          ["confirmation_required"],
          false
        ),
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 403 }
    );
  }

  if (!requestResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
        message: "YouTube upload request is missing required private/unlisted upload inputs.",
        missing_reasons: requestResult.missing_reasons,
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  const readiness = buildYouTubeUploadReadiness();
  if (!readiness.can_upload) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BLOCKED_BY_YOUTUBE_READINESS",
        message: "YouTube upload is blocked until token, scope, quota, account, policy, and enablement readiness pass.",
        readiness,
        result: blockedYouTubeUploadResult(
          requestResult.request.visibility,
          "YouTube upload was not attempted because readiness gates are blocked.",
          readiness.blocked_reasons,
          false
        ),
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 403 }
    );
  }

  const result = await new ServerYouTubeUploadAdapter().upload(requestResult.request);
  return NextResponse.json(
    {
      ok: result.succeeded,
      error_code: result.succeeded ? undefined : "BLOCKED_BY_YOUTUBE_READINESS",
      result,
      readiness,
      side_effects: result.side_effects,
      approval_required: true
    },
    { status: result.succeeded ? 200 : 403 }
  );
}

async function parseBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
