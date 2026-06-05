import { z } from "zod";

export const CANDIDATE_ONLY_EXECUTION_CONFIRMATION = "EXECUTE_CANDIDATE_ONLY_COLLECTOR";

export const candidateOnlySeedExecutionSchema = z.object({
  confirmation: z.literal(CANDIDATE_ONLY_EXECUTION_CONFIRMATION),
  mode: z.literal("candidate_only"),
  dry_run: z.literal(true),
  candidate_only: z.literal(true),
  queue_creation_enabled: z.literal(false),
  worker_job_creation_enabled: z.literal(false),
  render_plan_creation_enabled: z.literal(false),
  upload_package_creation_enabled: z.literal(false),
  upload_enabled: z.literal(false),
  keywords: z.array(z.string().trim().min(1)).min(1).max(50),
  limit_per_keyword: z.coerce.number().int().min(1).max(20).default(5),
  source: z.string().trim().max(80).optional()
});

export const candidateAnalyticsFilterSchema = z
  .object({
    from: optionalTextSchema(),
    to: optionalTextSchema(),
    keyword: optionalTextSchema(),
    category: optionalTextSchema(),
    risk_flag: optionalTextSchema(),
    status: optionalTextSchema(),
    min_score: optionalNumberSchema(),
    max_score: optionalNumberSchema(),
    collected_mode: optionalTextSchema(),
    collector_version: optionalTextSchema(),
    sort: z
      .enum(["newest", "oldest", "final_score_desc", "final_score_asc", "duplicate_rate_desc", "risk_rate_desc"])
      .optional(),
    limit: optionalNumberSchema()
  })
  .refine((value) => {
    if (value.min_score === undefined || value.max_score === undefined) {
      return true;
    }
    return value.min_score <= value.max_score;
  }, {
    path: ["max_score"],
    message: "min_score must be less than or equal to max_score."
  });

export const candidateSeedPlanOptionsSchema = z.object({
  strategy: z.enum(["balanced", "high_score", "low_duplicate", "low_risk", "discovery"]).optional(),
  max_keywords: optionalNumberSchema(),
  limit_per_keyword: optionalNumberSchema(),
  include_keep: optionalBooleanSchema(),
  include_expand: optionalBooleanSchema(),
  include_review: optionalBooleanSchema(),
  include_avoid: optionalBooleanSchema()
});

export const artifactBulkQaSchema = z.object({
  artifact_ids: z.array(z.string().trim().min(1)).min(1).max(200),
  qa_status: z.enum(["pending", "passed", "needs_fix", "rejected"]),
  qa_note: z.string().trim().max(1000).optional().default("")
});

export type CandidateOnlySeedExecutionFormValues = z.infer<typeof candidateOnlySeedExecutionSchema>;
export type CandidateOnlySeedExecutionFormInput = z.input<typeof candidateOnlySeedExecutionSchema>;
export type CandidateAnalyticsFilterValues = z.infer<typeof candidateAnalyticsFilterSchema>;
export type CandidateSeedPlanOptionValues = z.infer<typeof candidateSeedPlanOptionsSchema>;
export type ArtifactBulkQaValues = z.infer<typeof artifactBulkQaSchema>;
export type ArtifactBulkQaInput = z.input<typeof artifactBulkQaSchema>;

function optionalTextSchema() {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
  }, z.string().optional());
}

function optionalNumberSchema() {
  return z.preprocess((value) => {
    if (value === undefined || value === null || value === "") {
      return undefined;
    }
    const parsed = typeof value === "number" ? value : Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }, z.number().optional());
}

function optionalBooleanSchema() {
  return z.preprocess((value) => {
    if (value === "true" || value === true) {
      return true;
    }
    if (value === "false" || value === false) {
      return false;
    }
    return undefined;
  }, z.boolean().optional());
}
