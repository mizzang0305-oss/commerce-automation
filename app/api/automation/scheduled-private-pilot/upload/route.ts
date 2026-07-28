import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getKstDateString } from "@/lib/orchestration/commerceDailyCadence";
import { normalizePreparedVideoAssetRef } from "@/lib/uploads/youtube/uploadAssetContract";
import {
  executeScheduledPrivatePilot,
  type ScheduledPrivatePilotApproval
} from "@/lib/uploads/youtube/scheduledPrivatePilotGate";
import {
  ServerYouTubeUploadAdapter,
  getYouTubeUploadAccessTokenForServerUpload
} from "@/lib/uploads/youtube";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorized(request, process.env.SCHEDULED_PRIVATE_PILOT_API_SECRET)) {
    return NextResponse.json({ ok: false, blocker: "SCHEDULED_PRIVATE_PILOT_AUTH_REQUIRED" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const packageId = text(body.upload_package_id);
  const approval = parseApproval(body.approval);
  const asset = normalizePreparedVideoAssetRef(body.prepared_video_asset);
  if (!packageId || !approval || !asset) {
    return NextResponse.json({ ok: false, blocker: "PRIVATE_PILOT_INPUT_INVALID" }, { status: 400 });
  }

  const repository = getAutomationRepository();
  const uploadPackage = await repository.getChannelUploadPackage(packageId);
  if (!uploadPackage) {
    return NextResponse.json({ ok: false, blocker: "UPLOAD_PACKAGE_NOT_FOUND" }, { status: 404 });
  }
  const queue = await repository.getQueueItem(uploadPackage.product_queue_id);
  const candidates = await repository.getProductCandidates();
  const candidate = candidates.find((item) => item.promoted_queue_id === uploadPackage.product_queue_id);
  if (!queue || !candidate || !queue.selected_affiliate_url.trim()) {
    return NextResponse.json({ ok: false, blocker: "AUTHORITATIVE_PRODUCT_BINDING_REQUIRED" }, { status: 409 });
  }

  const now = new Date();
  const today = getKstDateString(now);
  const allPackages = await repository.getChannelUploadPackages();
  const dailyPrivateUploadCount = allPackages.filter(
    (item) =>
      item.platform === "youtube" &&
      item.platform_upload_status === "private_uploaded" &&
      item.uploaded_at &&
      getKstDateString(item.uploaded_at) === today
  ).length;
  const result = await executeScheduledPrivatePilot({
    uploadPackage,
    request: {
      provider: "youtube",
      candidate_id: candidate.id,
      prepared_video_asset: asset,
      video_path_or_url: asset.prepared_video_asset_url || asset.signed_url || "",
      title: uploadPackage.title,
      description: uploadPackage.description,
      tags: uploadPackage.hashtags.split(/\s+/).map((tag) => tag.replace(/^#/, "")).filter(Boolean),
      visibility: "private",
      execution_intent: "private_execute",
      disclosure_text: uploadPackage.disclosure_text,
      selected_affiliate_url: queue.selected_affiliate_url,
      pinned_comment_template: "",
      on_screen_cta_text: "구매 전 상품 페이지에서 최신 조건을 확인하세요.",
      made_for_kids: false,
      self_declared_made_for_kids: false
    },
    approval,
    adapter: new ServerYouTubeUploadAdapter({
      accessTokenProvider: () => getYouTubeUploadAccessTokenForServerUpload()
    }),
    now,
    dailyPrivateUploadCount,
    duplicateUploadExists: Boolean(uploadPackage.uploaded_at || uploadPackage.platform_upload_status === "private_uploaded"),
    safety: {
      SAFE_TO_UPLOAD: isTrue(process.env.SAFE_TO_UPLOAD),
      SAFE_TO_PUBLIC_UPLOAD: false,
      PUBLIC_UPLOAD_ENABLED: false,
      UNLISTED_UPLOAD_ENABLED: false,
      COMMENT_AUTOMATION_ENABLED: false,
      MAX_PRIVATE_PILOT_ITEMS: 1,
      FAKE_SUCCESS: false
    }
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: result.status === "HUMAN_REVIEW_REQUIRED" ? 502 : 409 });
  }
  await repository.upsertChannelUploadPackage({
    ...uploadPackage,
    status: "uploaded",
    uploaded_url: "",
    uploaded_at: now.toISOString(),
    uploaded_by: "owner-approved-private-pilot",
    upload_notes: JSON.stringify(result.sanitized_result),
    platform_upload_status: "private_uploaded",
    updated_at: now.toISOString()
  });
  return NextResponse.json({
    ...result,
    full_video_id_exposed: false,
    channel_id_exposed: false,
    youtube_url_exposed: false
  });
}

function parseApproval(value: unknown): ScheduledPrivatePilotApproval | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.decision !== "PASS") return null;
  const approval = {
    decision: "PASS" as const,
    package_id: text(input.package_id),
    approved_at: text(input.approved_at),
    expires_at: text(input.expires_at),
    nonce: text(input.nonce)
  };
  return Object.values(approval).every(Boolean) ? approval : null;
}

function isAuthorized(request: Request, configuredSecret: string | undefined) {
  const expected = configuredSecret?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected.length < 32 || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isTrue(value: unknown) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
