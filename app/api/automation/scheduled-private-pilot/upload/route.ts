import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { isServerBearerAuthorized } from "@/lib/server/serverSecretAuth";
import { resolveAuthoritativePrivatePilotBinding } from "@/lib/uploads/youtube/authoritativePrivatePilotBinding";
import { executeScheduledPrivatePilot } from "@/lib/uploads/youtube/scheduledPrivatePilotGate";
import { SupabasePrivatePilotRepository } from "@/lib/uploads/youtube/privatePilotRepository";
import {
  ServerYouTubeUploadAdapter,
  getYouTubeUploadAccessTokenForServerUpload
} from "@/lib/uploads/youtube";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isServerBearerAuthorized(request, process.env.PRIVATE_PILOT_UPLOAD_EXECUTOR_SECRET)) {
    return NextResponse.json({ ok: false, blocker: "PRIVATE_UPLOAD_EXECUTOR_AUTH_REQUIRED" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (
    "decision" in body ||
    "approval" in body ||
    "nonce" in body ||
    "prepared_video_asset" in body
  ) {
    return NextResponse.json(
      { ok: false, blocker: "CALLER_ASSERTED_APPROVAL_OR_ASSET_FORBIDDEN" },
      { status: 400 }
    );
  }
  const uploadPackageId = text(body.upload_package_id);
  const approvalId = text(body.approval_id);
  const approvalNonce = text(body.approval_nonce);
  if (!uploadPackageId || !approvalId || !/^[a-f0-9]{64}$/.test(approvalNonce)) {
    return NextResponse.json({ ok: false, blocker: "PRIVATE_PILOT_INPUT_INVALID" }, { status: 400 });
  }

  const privatePilotRepository = new SupabasePrivatePilotRepository();
  try {
    const approval = await privatePilotRepository.getOwnerApproval(approvalId);
    if (!approval || approval.upload_package_id !== uploadPackageId) {
      return NextResponse.json({ ok: false, blocker: "FRESH_OWNER_APPROVAL_REQUIRED" }, { status: 409 });
    }
    const binding = await resolveAuthoritativePrivatePilotBinding({
      repository: getAutomationRepository(),
      uploadPackageId,
      videoAssetId: approval.video_asset_id,
      expectedCandidateId: approval.product_candidate_id,
      expectedChecksumSha256: approval.video_checksum_sha256
    });
    const asset = binding.preparedVideoAsset;
    const result = await executeScheduledPrivatePilot({
      uploadPackage: binding.uploadPackage,
      request: {
        provider: "youtube",
        candidate_id: binding.candidate.id,
        prepared_video_asset: asset,
        video_path_or_url: asset.prepared_video_asset_url || asset.signed_url || "",
        title: binding.uploadPackage.title,
        description: binding.uploadPackage.description,
        tags: binding.uploadPackage.hashtags
          .split(/\s+/)
          .map((tag) => tag.replace(/^#/, ""))
          .filter(Boolean),
        visibility: "private",
        execution_intent: "private_execute",
        disclosure_text: binding.uploadPackage.disclosure_text,
        selected_affiliate_url: binding.queue.selected_affiliate_url,
        pinned_comment_template: "",
        on_screen_cta_text: "링크의 상품 페이지에서 최신 조건을 확인하세요.",
        made_for_kids: false,
        self_declared_made_for_kids: false
      },
      approval,
      approvalNonce,
      reservationStore: privatePilotRepository,
      adapter: new ServerYouTubeUploadAdapter({
        accessTokenProvider: () => getYouTubeUploadAccessTokenForServerUpload()
      }),
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
    return NextResponse.json(
      {
        ...result,
        full_video_id_exposed: false,
        channel_id_exposed: false,
        youtube_url_exposed: false
      },
      { status: result.ok ? 200 : result.status === "HUMAN_REVIEW_REQUIRED" ? 502 : 409 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, blocker: safeError(error, "PRIVATE_PILOT_EXECUTION_FAILED") },
      { status: 409 }
    );
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isTrue(value: unknown) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function safeError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_]{1,80}$/.test(message) ? message : fallback;
}
