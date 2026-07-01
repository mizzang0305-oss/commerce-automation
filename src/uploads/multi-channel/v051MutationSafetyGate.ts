import type { V051ExecutionMode } from "./v051ExecutionMode";
import type { V051UploadPreflightReport } from "./v051ApprovalAliasWrapper";

export type V051MutationBlocker =
  | "CHECK_ONLY_NO_UPLOAD"
  | "DRY_RUN_NO_UPLOAD"
  | "V049_APPROVAL_PHRASE_NOT_ALLOWED_IN_V051"
  | "V051_UPLOAD_APPROVAL_MISSING"
  | "V051_PAID_PROMOTION_CONFIRMATION_MISSING"
  | "BLOCKED_V051_PREFLIGHT_NOT_READY"
  | "BLOCKED_V051_ADAPTERS_NOT_READY"
  | "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
  | "DUPLICATE_UPLOAD_RISK"
  | "METADATA_GATE_NOT_READY"
  | "V051_MUTATION_ADAPTERS_NOT_INJECTED"
  | "RUNTIME_CHANNEL_ROUTE_NOT_READY"
  | "RUNTIME_TOKEN_PROVIDER_NOT_READY"
  | "RUNTIME_VIDEO_ASSET_NOT_READY"
  | "RUNTIME_YOUTUBE_UPLOAD_FAILED"
  | "RUNTIME_COMMENT_FAILED"
  | "AMBIGUOUS_UPLOAD_RESULT_AFTER_EXTERNAL_CALL"
  | "AMBIGUOUS_COMMENT_RESULT_AFTER_EXTERNAL_CALL"
  | "NON_PUBLIC_UPLOAD_RESULT_REJECTED"
  | "UPLOAD_RESULT_VIDEO_ID_MISSING";

export type V051MutationSafetyGate = {
  mutation_mode_allowed: boolean;
  mutation_blocker: V051MutationBlocker | null;
  mutation_mode_requires_fresh_approval: true;
  channel_routing_gate_required: true;
  duplicate_upload_guard_required: true;
  metadata_gate_required: true;
  paid_promotion_confirmation_required: true;
};

export function evaluateV051MutationSafetyGate(input: {
  executionMode: V051ExecutionMode;
  preflight: V051UploadPreflightReport;
  uploadAdapterInjected: boolean;
  commentAdapterInjected: boolean;
  channelRoutingReady?: boolean;
  duplicateUploadRisk?: boolean;
  metadataGateReady?: boolean;
}): V051MutationSafetyGate {
  const blocker = firstBlocker<V051MutationBlocker>([
    input.executionMode === "check_only" ? "CHECK_ONLY_NO_UPLOAD" : null,
    input.executionMode === "dry_run" ? "DRY_RUN_NO_UPLOAD" : null,
    input.preflight.approval_blocker as V051MutationBlocker | null,
    input.preflight.FINAL_STATUS === "BLOCKED_V051_PREFLIGHT_NOT_READY" ||
      !input.preflight.V049_UPLOAD_PREFLIGHT_READY ||
      !input.preflight.all_channel_preflight_pass
      ? "BLOCKED_V051_PREFLIGHT_NOT_READY"
      : null,
    input.preflight.FINAL_STATUS === "BLOCKED_V051_ADAPTERS_NOT_READY" ||
      !input.preflight.V050_ADAPTERS_READY
      ? "BLOCKED_V051_ADAPTERS_NOT_READY"
      : null,
    input.preflight.FINAL_STATUS === "BLOCKED_V051_CHANNEL_ROUTING_NOT_READY" ||
      input.channelRoutingReady === false ||
      !input.preflight.CHANNEL_ROUTING_READY
      ? "BLOCKED_CHANNEL_ACCOUNT_ROUTING_NOT_READY"
      : null,
    input.duplicateUploadRisk === true || input.preflight.duplicate_upload_risk
      ? "DUPLICATE_UPLOAD_RISK"
      : null,
    input.metadataGateReady === false || !metadataReady(input.preflight)
      ? "METADATA_GATE_NOT_READY"
      : null,
    input.uploadAdapterInjected && input.commentAdapterInjected
      ? null
      : "V051_MUTATION_ADAPTERS_NOT_INJECTED"
  ]);

  return {
    mutation_mode_allowed: input.executionMode === "mutation_enabled" && blocker === null,
    mutation_blocker: blocker,
    mutation_mode_requires_fresh_approval: true,
    channel_routing_gate_required: true,
    duplicate_upload_guard_required: true,
    metadata_gate_required: true,
    paid_promotion_confirmation_required: true
  };
}

function metadataReady(preflight: V051UploadPreflightReport) {
  return preflight.preflight?.channels.every((channel) => channel.description_metadata_gate.can_pass_metadata_gate) ?? false;
}

function firstBlocker<T extends string>(values: Array<T | null>) {
  return values.find((value): value is T => Boolean(value)) ?? null;
}
