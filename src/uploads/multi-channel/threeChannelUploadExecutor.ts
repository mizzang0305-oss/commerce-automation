import { type ChannelKey } from "./channelProfiles";
import {
  V049_UPLOAD_APPROVAL_PHRASE,
  buildV049InternalCommentText,
  buildV049ThreeChannelUploadPreflight,
  type V049AffiliateUrls
} from "./threeChannelUploadPreflight";
import {
  evaluateV049PaidPromotionGate
} from "./paidPromotionSettingsGate";

export type V049UploadExecutionResult = {
  FINAL_STATUS: "V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD" | "BLOCKED_V049_THREE_CHANNEL_UPLOAD_EXECUTION";
  upload_execution_attempted: boolean;
  videos_insert_called: boolean;
  videos_insert_total_count: number;
  comment_create_update_delete_called: boolean;
  father_jobs_uploaded: boolean;
  father_jobs_video_id: string | null;
  father_jobs_comment_created: boolean;
  neoman_moleulgeol_uploaded: boolean;
  neoman_moleulgeol_video_id: string | null;
  neoman_moleulgeol_comment_created: boolean;
  lets_buy_uploaded: boolean;
  lets_buy_video_id: string | null;
  lets_buy_comment_created: boolean;
  retry_loop_after_external_call: boolean;
  blocker: "FRESH_UPLOAD_APPROVAL_MISSING" | "MANUAL_PAID_PROMOTION_CHECK_REQUIRED" | "PREFLIGHT_BLOCKED" | "YOUTUBE_UPLOAD_ADAPTER_NOT_INJECTED";
};

export type V049UploadExecutorDependencies = {
  uploadVideo?: (input: {
    channelKey: ChannelKey;
    videoPath: string;
    title: string;
    description: string;
    visibility: "public";
    containsPaidPromotion: true;
    madeForKids: false;
  }) => Promise<{ videoId: string }>;
  createTopLevelComment?: (input: {
    channelKey: ChannelKey;
    videoId: string;
    commentText: string;
  }) => Promise<{ commentId: string }>;
};

export async function executeV049ThreeChannelPublicUploads(input: {
  cwd?: string;
  affiliateUrls?: V049AffiliateUrls;
  approvalText?: string;
  deps?: V049UploadExecutorDependencies;
} = {}): Promise<V049UploadExecutionResult> {
  const approvalText = input.approvalText ?? "";
  const preflight = await buildV049ThreeChannelUploadPreflight(input);
  const approvalPresent = approvalText.includes(V049_UPLOAD_APPROVAL_PHRASE);
  const paidGate = evaluateV049PaidPromotionGate({ approvalText });

  if (!approvalPresent) {
    return blocked("FRESH_UPLOAD_APPROVAL_MISSING");
  }
  if (paidGate.blocker) {
    return blocked(paidGate.blocker);
  }
  if (!preflight.all_channel_preflight_pass) {
    return blocked("PREFLIGHT_BLOCKED");
  }
  if (!input.deps?.uploadVideo || !input.deps?.createTopLevelComment) {
    return blocked("YOUTUBE_UPLOAD_ADAPTER_NOT_INJECTED");
  }

  // The real adapter is intentionally injectable so the script cannot upload
  // unless a future task wires an explicit, reviewed YouTube dependency.
  return blocked("YOUTUBE_UPLOAD_ADAPTER_NOT_INJECTED");

  function blocked(blocker: V049UploadExecutionResult["blocker"]): V049UploadExecutionResult {
    return {
      FINAL_STATUS: blocker === "FRESH_UPLOAD_APPROVAL_MISSING"
        ? "V049_UPLOAD_PREFLIGHT_READY_NO_UPLOAD"
        : "BLOCKED_V049_THREE_CHANNEL_UPLOAD_EXECUTION",
      upload_execution_attempted: false,
      videos_insert_called: false,
      videos_insert_total_count: 0,
      comment_create_update_delete_called: false,
      father_jobs_uploaded: false,
      father_jobs_video_id: null,
      father_jobs_comment_created: false,
      neoman_moleulgeol_uploaded: false,
      neoman_moleulgeol_video_id: null,
      neoman_moleulgeol_comment_created: false,
      lets_buy_uploaded: false,
      lets_buy_video_id: null,
      lets_buy_comment_created: false,
      retry_loop_after_external_call: false,
      blocker
    };
  }
}

export function buildV049ExecutionCommentText(input: {
  channelKey: ChannelKey;
  affiliateUrl: string;
}) {
  return buildV049InternalCommentText(input);
}
