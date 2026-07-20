import {
  commerceOrchestratorCallbackSchema,
  commerceOrchestratorPayloadSchema,
  type CommerceContentDraft,
  type CommerceOrchestratorCallback,
  type CommerceOrchestratorPayload,
  type OrchestratorTarget,
  type ReviewedProduct
} from "@/lib/orchestration/commercePocSchemas";

export function buildCommerceOrchestratorPayload(input: {
  target: OrchestratorTarget;
  requestId: string;
  batchId: string;
  emittedAt: string;
  reviews: ReviewedProduct[];
  drafts: CommerceContentDraft[];
}): CommerceOrchestratorPayload {
  const passed = input.reviews.filter((review) => review.status === "pass").length;
  return commerceOrchestratorPayloadSchema.parse({
    schema_version: "1",
    event_type: "commerce.poc.review_ready",
    target: input.target,
    dispatch_mode: "contract_only",
    request_id: input.requestId,
    emitted_at: input.emittedAt,
    batch_id: input.batchId,
    counts: {
      collected: input.reviews.length,
      review_passed: passed,
      review_blocked: input.reviews.length - passed,
      drafts_created: input.drafts.length
    },
    drafts: input.drafts.map((draft) => ({
      draft_id: draft.id,
      product_raw_hash: draft.product_raw_hash,
      source_url: draft.source_url,
      state: draft.state
    })),
    approval: {
      required: true,
      publish_allowed: false
    },
    notification: {
      adapter: "blocked",
      dispatch_requested: false
    },
    side_effects: {
      webhook_called: false,
      notification_sent: false,
      platform_upload_attempted: false,
      queue_created: false,
      worker_jobs_created: false
    }
  });
}

export function parseCommerceOrchestratorCallback(input: unknown): CommerceOrchestratorCallback {
  return commerceOrchestratorCallbackSchema.parse(input);
}
