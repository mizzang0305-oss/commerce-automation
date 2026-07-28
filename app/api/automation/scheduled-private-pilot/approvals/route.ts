import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { isServerBearerAuthorized } from "@/lib/server/serverSecretAuth";
import { resolveAuthoritativePrivatePilotBinding } from "@/lib/uploads/youtube/authoritativePrivatePilotBinding";
import { SupabasePrivatePilotRepository } from "@/lib/uploads/youtube/privatePilotRepository";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isServerBearerAuthorized(request, process.env.PRIVATE_PILOT_OWNER_APPROVAL_SECRET)) {
    return NextResponse.json({ ok: false, blocker: "OWNER_APPROVAL_AUTH_REQUIRED" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if ("decision" in body || "approval" in body || "nonce" in body) {
    return NextResponse.json(
      { ok: false, blocker: "CALLER_ASSERTED_APPROVAL_FORBIDDEN" },
      { status: 400 }
    );
  }
  const uploadPackageId = text(body.upload_package_id);
  const videoAssetId = text(body.video_asset_id);
  const expiresInSeconds = integer(body.expires_in_seconds);
  if (
    !uploadPackageId ||
    !videoAssetId ||
    expiresInSeconds < 60 ||
    expiresInSeconds > 900
  ) {
    return NextResponse.json({ ok: false, blocker: "OWNER_APPROVAL_INPUT_INVALID" }, { status: 400 });
  }
  try {
    const binding = await resolveAuthoritativePrivatePilotBinding({
      repository: getAutomationRepository(),
      uploadPackageId,
      videoAssetId
    });
    if (
      binding.uploadPackage.status !== "manual_ready" ||
      !binding.uploadPackage.manual_upload_only ||
      binding.uploadPackage.platform !== "youtube" ||
      binding.queue.manual_review_status !== "approved"
    ) {
      return NextResponse.json({ ok: false, blocker: "UPLOAD_PACKAGE_NOT_MANUAL_READY" }, { status: 409 });
    }
    const created = await new SupabasePrivatePilotRepository().createOwnerApproval({
      binding,
      expiresInSeconds
    });
    const response = NextResponse.json({
      ok: true,
      approval_id: created.approval.approval_id,
      approval_nonce: created.approvalNonce,
      status: created.approval.status,
      approved_at: created.approval.approved_at,
      expires_at: created.approval.expires_at,
      approval_nonce_persisted_raw: false,
      video_url_exposed: false,
      full_video_id_exposed: false,
      upload_executor_called: false,
      videos_insert_called: false
    });
    response.headers.set("cache-control", "no-store");
    return response;
  } catch (error) {
    const blocker = safeError(error, "OWNER_APPROVAL_CREATION_FAILED");
    return NextResponse.json({ ok: false, blocker }, { status: blocker.endsWith("_NOT_FOUND") ? 404 : 409 });
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function integer(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : 0;
}

function safeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_]{1,80}$/.test(message) ? message : fallback;
}
