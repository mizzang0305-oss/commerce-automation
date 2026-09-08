import { APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD } from "./privateCanaryCoordinator";
import { buildV2AResumableInitiationUrl } from "./resumablePrivateUploadAdapter";
import { validateV2AUploadPackage, type V2AUploadPackage } from "./uploadPackage";

export type V2AReadinessRouteAuthorizationInput = {
  authenticated: boolean;
  subjectId: string | null;
  ownerSubjectId: string;
  approvalPhrase: string | null;
  mode: "readiness_dry_run" | "execute";
  visibility: "private" | "unlisted" | "public";
  maxItems: number;
};

export type V2AReadinessRouteAuthorizationResult = {
  authorized: boolean;
  code:
    | "ROUTE_AUTHORIZED_READINESS_DRY_RUN"
    | "ANONYMOUS_REJECTED"
    | "NON_OWNER_REJECTED"
    | "EXACT_PHRASE_REQUIRED"
    | "DRY_RUN_MODE_REQUIRED"
    | "PRIVATE_VISIBILITY_REQUIRED"
    | "SINGLE_ITEM_REQUIRED";
  dryRunOnly: true;
  coordinatorInvoked: false;
  approvalPhraseForwarded: false;
  videosInsertCalls: 0;
  resumableSessionCalls: 0;
  mediaUploadBytes: 0;
  platformUploads: 0;
};

export type V2APrivateCanaryDryRunRequest = {
  method: "POST";
  url: string;
  redirect: "error";
  body: {
    snippet: {
      title: string;
      description: string;
      tags: readonly string[];
      categoryId: string;
    };
    status: {
      privacyStatus: "private";
      selfDeclaredMadeForKids: boolean;
      containsSyntheticMedia: boolean;
    };
  };
  targetChannelId: string;
  notifySubscribers: false;
  authorizationHeaderIncluded: false;
  mediaAttached: false;
  videosInsertCalls: 0;
  resumableSessionCalls: 0;
  mediaUploadBytes: 0;
  platformUploads: 0;
};

export function authorizeV2AReadinessDryRun(
  input: V2AReadinessRouteAuthorizationInput
): V2AReadinessRouteAuthorizationResult {
  if (!input.authenticated || !input.subjectId?.trim()) return routeResult(false, "ANONYMOUS_REJECTED");
  if (!input.ownerSubjectId.trim() || input.subjectId !== input.ownerSubjectId) return routeResult(false, "NON_OWNER_REJECTED");
  if (input.approvalPhrase !== APPROVE_YOUTUBE_PRIVATE_CANARY_UPLOAD) return routeResult(false, "EXACT_PHRASE_REQUIRED");
  if (input.mode !== "readiness_dry_run") return routeResult(false, "DRY_RUN_MODE_REQUIRED");
  if (input.visibility !== "private") return routeResult(false, "PRIVATE_VISIBILITY_REQUIRED");
  if (input.maxItems !== 1) return routeResult(false, "SINGLE_ITEM_REQUIRED");
  return routeResult(true, "ROUTE_AUTHORIZED_READINESS_DRY_RUN");
}

export function buildV2APrivateCanaryDryRunRequest(
  uploadPackage: V2AUploadPackage
): V2APrivateCanaryDryRunRequest {
  const validation = validateV2AUploadPackage(uploadPackage);
  if (!validation.valid) {
    throw new Error(validation.blockers[0] ?? "V2A_UPLOAD_PACKAGE_INVALID");
  }
  return {
    method: "POST",
    url: buildV2AResumableInitiationUrl(),
    redirect: "error",
    body: {
      snippet: {
        title: uploadPackage.title,
        description: uploadPackage.description,
        tags: uploadPackage.tags,
        categoryId: uploadPackage.categoryId
      },
      status: {
        privacyStatus: "private",
        selfDeclaredMadeForKids: uploadPackage.madeForKids,
        containsSyntheticMedia: uploadPackage.containsSyntheticMedia
      }
    },
    targetChannelId: uploadPackage.targetChannelId,
    notifySubscribers: false,
    authorizationHeaderIncluded: false,
    mediaAttached: false,
    videosInsertCalls: 0,
    resumableSessionCalls: 0,
    mediaUploadBytes: 0,
    platformUploads: 0
  };
}

function routeResult(
  authorized: boolean,
  code: V2AReadinessRouteAuthorizationResult["code"]
): V2AReadinessRouteAuthorizationResult {
  return {
    authorized,
    code,
    dryRunOnly: true,
    coordinatorInvoked: false,
    approvalPhraseForwarded: false,
    videosInsertCalls: 0,
    resumableSessionCalls: 0,
    mediaUploadBytes: 0,
    platformUploads: 0
  };
}
