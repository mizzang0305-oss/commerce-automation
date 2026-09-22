import { z } from "zod";

export const collectedProductSchema = z.object({
  schema_version: z.literal("1"),
  product_name: z.string(),
  price: z.number().nonnegative().nullable(),
  image_url: z.string(),
  stock_status: z.enum(["in_stock", "out_of_stock", "unknown"]),
  seller: z.string(),
  collected_at: z.string().datetime(),
  source_url: z.string(),
  raw_hash: z.string().regex(/^[0-9a-f]{64}$/)
}).strict();

export const collectorSourcePolicySchema = z.object({
  allowed_hosts: z.array(z.string().trim().min(1)).min(1),
  authorization_basis: z.enum(["public_page", "owned_channel"]),
  forbidden_words: z.array(z.string().trim().min(1)).default([]),
  exaggeration_terms: z.array(z.string().trim().min(1)).default([])
}).strict();

export const commerceReviewIssueCodeSchema = z.enum([
  "PRODUCT_NAME_MISSING",
  "PRICE_MISSING",
  "IMAGE_MISSING",
  "IMAGE_URL_INVALID",
  "DUPLICATE_PRODUCT",
  "FORBIDDEN_WORD",
  "EXAGGERATED_CLAIM",
  "SOURCE_URL_INVALID",
  "SOURCE_NOT_ALLOWED"
]);

export const commerceReviewIssueSchema = z.object({
  code: commerceReviewIssueCodeSchema,
  field: z.string(),
  message: z.string()
}).strict();

export const reviewedProductSchema = z.object({
  product: collectedProductSchema,
  status: z.enum(["pass", "blocked"]),
  issues: z.array(commerceReviewIssueSchema),
  reviewed_at: z.string().datetime()
}).strict();

export const commerceContentDraftSchema = z.object({
  schema_version: z.literal("1"),
  id: z.string().min(1),
  product_raw_hash: z.string().regex(/^[0-9a-f]{64}$/),
  state: z.literal("draft"),
  title: z.string().min(1),
  short_caption: z.string().min(1),
  description: z.string().min(1),
  image_url: z.string().url(),
  source_url: z.string().url(),
  channels: z.array(z.enum(["youtube_shorts", "tiktok", "threads", "shopping_mall"])).min(1),
  approval_required: z.literal(true),
  publish_allowed: z.literal(false),
  created_at: z.string().datetime()
}).strict();

export const orchestratorTargetSchema = z.enum(["activepieces", "windmill"]);

export const commerceOrchestratorPayloadSchema = z.object({
  schema_version: z.literal("1"),
  event_type: z.literal("commerce.poc.review_ready"),
  target: orchestratorTargetSchema,
  dispatch_mode: z.literal("contract_only"),
  request_id: z.string().min(1),
  emitted_at: z.string().datetime(),
  batch_id: z.string().min(1),
  counts: z.object({
    collected: z.number().int().nonnegative(),
    review_passed: z.number().int().nonnegative(),
    review_blocked: z.number().int().nonnegative(),
    drafts_created: z.number().int().nonnegative()
  }).strict(),
  drafts: z.array(z.object({
    draft_id: z.string().min(1),
    product_raw_hash: z.string().regex(/^[0-9a-f]{64}$/),
    source_url: z.string().url(),
    state: z.literal("draft")
  }).strict()),
  approval: z.object({
    required: z.literal(true),
    publish_allowed: z.literal(false)
  }).strict(),
  notification: z.object({
    adapter: z.literal("blocked"),
    dispatch_requested: z.literal(false)
  }).strict(),
  side_effects: z.object({
    webhook_called: z.literal(false),
    notification_sent: z.literal(false),
    platform_upload_attempted: z.literal(false),
    queue_created: z.literal(false),
    worker_jobs_created: z.literal(false)
  }).strict()
}).strict();

export const commerceOrchestratorCallbackSchema = z.object({
  schema_version: z.literal("1"),
  request_id: z.string().min(1),
  target: orchestratorTargetSchema,
  status: z.enum(["accepted", "rejected"]),
  accepted_draft_ids: z.array(z.string().min(1)),
  publish_requested: z.literal(false),
  received_at: z.string().datetime()
}).strict();

export const publishApprovalSchema = z.object({
  draft_id: z.string().min(1),
  approval_id: z.string().min(8),
  approved_by: z.string().min(1),
  approved_at: z.string().datetime(),
  approved: z.literal(true)
}).strict();

export type CollectedProduct = z.infer<typeof collectedProductSchema>;
export type CollectorSourcePolicy = z.infer<typeof collectorSourcePolicySchema>;
export type CommerceReviewIssue = z.infer<typeof commerceReviewIssueSchema>;
export type ReviewedProduct = z.infer<typeof reviewedProductSchema>;
export type CommerceContentDraft = z.infer<typeof commerceContentDraftSchema>;
export type CommerceOrchestratorPayload = z.infer<typeof commerceOrchestratorPayloadSchema>;
export type CommerceOrchestratorCallback = z.infer<typeof commerceOrchestratorCallbackSchema>;
export type OrchestratorTarget = z.infer<typeof orchestratorTargetSchema>;
export type PublishApproval = z.infer<typeof publishApprovalSchema>;
