import { NextResponse } from "next/server";
import {
  ServerYouTubeUploadAdapter,
  buildYouTubeExecuteReadiness,
  buildYouTubeProductVideoUploadPackage,
  buildYouTubeUploadReadiness,
  buildYouTubeUploadRequest,
  getYouTubeUploadAccessTokenForServerUpload,
  hasExactYouTubeUploadConfirmation,
  youtubeUploadSafeSideEffects
} from "@/lib/uploads/youtube";
import { blockedYouTubeUploadResult } from "@/lib/uploads/youtube/youtubeUploadErrors";

export async function POST(request: Request) {
  const body = await parseBody(request);
  const requestedVisibility = body.visibility;
  const visibility = requestedVisibility === "unlisted" ? "unlisted" : "private";

  if (!hasExactYouTubeUploadConfirmation(body.confirmation)) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "BLOCKED_BY_CONFIRMATION",
        message: "Exact YouTube private upload confirmation is required.",
        result: blockedYouTubeUploadResult(
          visibility,
          "YouTube upload was not attempted because the confirmation phrase did not match.",
          ["upload_confirmation_missing", "private_execute_approval_missing"],
          false
        ),
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 403 }
    );
  }

  if (requestedVisibility === "public" || requestedVisibility === "unlisted") {
    const reason = requestedVisibility === "public"
      ? "visibility_public_blocked"
      : "visibility_unlisted_blocked";
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
        message: "This YouTube execute path allows private visibility only.",
        missing_reasons: [reason],
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  const packageResult = buildYouTubeProductVideoUploadPackage(body);
  if (!packageResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_PRODUCT_UPLOAD_PACKAGE_NOT_READY",
        message: "YouTube product upload package is not ready for private execute.",
        missing_reasons: packageResult.blocked_reasons,
        package_readiness: packageResult.readiness,
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  const requestResult = buildYouTubeUploadRequest({
    ...packageResult.package,
    execution_intent: body.execution_intent ?? body.upload_intent,
    smoke_approval: body.smoke_approval ?? body.smokeApproval
  });
  if (!requestResult.ok) {
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
        message: "YouTube upload request is missing required private upload inputs.",
        missing_reasons: requestResult.missing_reasons,
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  if (requestResult.request.visibility !== "private") {
    const reason = requestResult.request.visibility === "unlisted"
      ? "visibility_unlisted_blocked"
      : "visibility_public_blocked";
    return NextResponse.json(
      {
        ok: false,
        error_code: "YOUTUBE_UPLOAD_REQUEST_NOT_READY",
        message: "This YouTube execute path allows private visibility only.",
        missing_reasons: [reason],
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 400 }
    );
  }

  const readiness = buildYouTubeUploadReadiness();
  if (!readiness.can_upload) {
    const blockedReasons = readiness.blocked_reasons.length ? readiness.blocked_reasons : ["youtube_readiness_blocked"];
    return NextResponse.json(
      {
        ok: false,
        error_code: "BLOCKED_BY_YOUTUBE_READINESS",
        message: "YouTube upload is blocked until token, scope, quota, account, policy, and enablement readiness pass.",
        safe_error: "YouTube upload was not attempted because readiness gates are blocked.",
        blocked_reasons: blockedReasons,
        readiness,
        gates: buildYouTubeExecuteReadiness({
          confirmation: body.confirmation,
          smokeApproval: body.smoke_approval ?? body.smokeApproval,
          executionIntent: requestResult.request.execution_intent,
          visibility: requestResult.request.visibility
        }).gates,
        result: blockedYouTubeUploadResult(
          requestResult.request.visibility,
          "YouTube upload was not attempted because readiness gates are blocked.",
          blockedReasons,
          false
        ),
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 403 }
    );
  }

  const executeReadiness = buildYouTubeExecuteReadiness({
    confirmation: body.confirmation,
    smokeApproval: body.smoke_approval ?? body.smokeApproval,
    executionIntent: requestResult.request.execution_intent,
    visibility: requestResult.request.visibility
  });
  if (!executeReadiness.can_execute) {
    const blockedReasons = executeReadiness.blocked_reasons.length ? executeReadiness.blocked_reasons : ["youtube_execute_readiness_blocked"];
    return NextResponse.json(
      {
        ok: false,
        error_code: "BLOCKED_BY_YOUTUBE_READINESS",
        message: "YouTube upload is blocked until server execute readiness gates pass.",
        safe_error: "YouTube upload was not attempted because execute readiness gates are blocked.",
        blocked_reasons: blockedReasons,
        readiness,
        execute_readiness: executeReadiness,
        gates: executeReadiness.gates,
        result: blockedYouTubeUploadResult(
          requestResult.request.visibility,
          "YouTube upload was not attempted because execute readiness gates are blocked.",
          blockedReasons,
          false
        ),
        side_effects: youtubeUploadSafeSideEffects,
        approval_required: true
      },
      { status: 403 }
    );
  }

  const result = await new ServerYouTubeUploadAdapter({
    accessTokenProvider: () => getYouTubeUploadAccessTokenForServerUpload()
  }).upload(requestResult.request);
  const resultBlockedReasons = result.blocked_reasons.length ? result.blocked_reasons : ["youtube_upload_blocked"];
  return NextResponse.json(
    {
      ok: result.succeeded,
      error_code: result.succeeded ? undefined : "BLOCKED_BY_YOUTUBE_READINESS",
      safe_error: result.succeeded ? undefined : result.safe_message,
      blocked_reasons: result.succeeded ? [] : resultBlockedReasons,
      result,
      readiness,
      execute_readiness: executeReadiness,
      gates: executeReadiness.gates,
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
