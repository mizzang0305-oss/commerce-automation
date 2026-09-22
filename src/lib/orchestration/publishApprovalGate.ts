import {
  publishApprovalSchema,
  type CommerceContentDraft
} from "@/lib/orchestration/commercePocSchemas";

export type PublishApprovalDecision = {
  publish_allowed: boolean;
  approval_valid: boolean;
  blocker: string;
  approval_id: string;
};

export function evaluatePublishApproval(
  draft: CommerceContentDraft,
  rawApproval?: unknown
): PublishApprovalDecision {
  const parsed = publishApprovalSchema.safeParse(rawApproval);
  if (!parsed.success) {
    return {
      publish_allowed: false,
      approval_valid: false,
      blocker: "PUBLISH_APPROVAL_REQUIRED",
      approval_id: ""
    };
  }
  if (parsed.data.draft_id !== draft.id) {
    return {
      publish_allowed: false,
      approval_valid: false,
      blocker: "PUBLISH_APPROVAL_DRAFT_MISMATCH",
      approval_id: ""
    };
  }
  return {
    publish_allowed: false,
    approval_valid: true,
    blocker: "PUBLISH_EXECUTOR_NOT_IMPLEMENTED",
    approval_id: parsed.data.approval_id
  };
}
