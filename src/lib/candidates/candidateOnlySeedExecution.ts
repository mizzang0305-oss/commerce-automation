import { createHash } from "node:crypto";
import { buildCoupangCandidate } from "@/lib/coupang/coupangCandidateImport";
import type { AutomationRepository } from "@/lib/repositories/types";
import type { ProductCandidate } from "@/types/automation";

const CONFIRMATION = "EXECUTE_CANDIDATE_ONLY_COLLECTOR";

type CandidateOnlySeedExecutionInput = {
  confirmation?: unknown;
  mode?: unknown;
  dry_run?: unknown;
  candidate_only?: unknown;
  queue_creation_enabled?: unknown;
  worker_job_creation_enabled?: unknown;
  render_plan_creation_enabled?: unknown;
  upload_package_creation_enabled?: unknown;
  upload_enabled?: unknown;
  keywords?: unknown;
  limit_per_keyword?: unknown;
  source?: unknown;
};

type CandidateOnlySeedExecutionErrorCode =
  | "CANDIDATE_ONLY_CONFIRMATION_REQUIRED"
  | "CANDIDATE_ONLY_SAFETY_FLAGS_REQUIRED"
  | "CANDIDATE_ONLY_KEYWORDS_REQUIRED"
  | "CANDIDATE_ONLY_EXECUTION_FAILED";

type SideEffects = {
  queue_created: false;
  worker_jobs_created: false;
  render_plan_created: false;
  upload_package_created: false;
  upload_triggered: false;
  platform_upload_triggered: false;
};

const NO_SIDE_EFFECTS: SideEffects = {
  queue_created: false,
  worker_jobs_created: false,
  render_plan_created: false,
  upload_package_created: false,
  upload_triggered: false,
  platform_upload_triggered: false
};

export type CandidateOnlySeedExecutionResponse =
  | {
      ok: true;
      status: 200;
      mode: "candidate_only";
      dry_run: true;
      created_count: number;
      duplicate_count: number;
      manual_review_count: number;
      rejected_count: 0;
      candidate_ids: string[];
      side_effects: SideEffects;
      safety: {
        candidate_only: true;
        confirmation_required: true;
        confirmation_matched: true;
      };
    }
  | {
      ok: false;
      status: 400 | 500;
      error_code: CandidateOnlySeedExecutionErrorCode;
      message: string;
      safe_error: string;
      side_effects: SideEffects;
      safety: {
        candidate_only: boolean;
        confirmation_required: true;
        confirmation_matched: boolean;
      };
    };

export async function buildCandidateOnlySeedExecution(
  repository: AutomationRepository,
  rawInput: unknown
): Promise<CandidateOnlySeedExecutionResponse> {
  const input = toInput(rawInput);
  const confirmationMatched = text(input.confirmation) === CONFIRMATION;
  if (!confirmationMatched) {
    return errorResponse(
      "CANDIDATE_ONLY_CONFIRMATION_REQUIRED",
      "Candidate-only execution confirmation is required.",
      "confirmation must equal EXECUTE_CANDIDATE_ONLY_COLLECTOR.",
      input,
      400
    );
  }
  if (!hasSafeFlags(input)) {
    return errorResponse(
      "CANDIDATE_ONLY_SAFETY_FLAGS_REQUIRED",
      "Candidate-only safety flags are required.",
      "candidate_only must be true and queue, worker, render, package, upload flags must be false.",
      input,
      400
    );
  }

  const keywords = normalizeKeywords(input.keywords);
  if (keywords.length === 0) {
    return errorResponse(
      "CANDIDATE_ONLY_KEYWORDS_REQUIRED",
      "At least one seed keyword is required.",
      "keywords must include at least one non-empty keyword.",
      input,
      400
    );
  }

  try {
    const existingCandidates = await repository.getProductCandidates();
    const existingIds = new Set(existingCandidates.map((item) => item.id));
    const existingKeys = new Set(existingCandidates.map((item) => item.product_key).filter(Boolean));
    const candidates = buildSeedCandidates({
      keywords,
      limitPerKeyword: normalizeLimit(input.limit_per_keyword),
      source: text(input.source) || "seed_plan",
      existingCandidates
    });
    const newCandidates = candidates.filter((item) => {
      const key = item.product_key || "";
      return !existingIds.has(item.id) && !(key && existingKeys.has(key));
    });
    const saved = newCandidates.length > 0
      ? await repository.upsertProductCandidates(newCandidates)
      : [];

    return {
      ok: true,
      status: 200,
      mode: "candidate_only",
      dry_run: true,
      created_count: saved.length,
      duplicate_count: candidates.length - newCandidates.length,
      manual_review_count: saved.filter((item) => item.promotion_status !== "ready").length,
      rejected_count: 0,
      candidate_ids: saved.map((item) => item.id),
      side_effects: {
        queue_created: false,
        worker_jobs_created: false,
        render_plan_created: false,
        upload_package_created: false,
        upload_triggered: false,
        platform_upload_triggered: false
      },
      safety: {
        candidate_only: true,
        confirmation_required: true,
        confirmation_matched: true
      }
    };
  } catch (error) {
    console.error("[candidates/execute-seed-plan] failed", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return errorResponse(
      "CANDIDATE_ONLY_EXECUTION_FAILED",
      "Candidate-only execution failed.",
      "candidate-only execution failed without creating queue, worker, render, package, or upload side effects.",
      input,
      500
    );
  }
}

function buildSeedCandidates(input: {
  keywords: string[];
  limitPerKeyword: number;
  source: string;
  existingCandidates: ProductCandidate[];
}) {
  const candidates: ProductCandidate[] = [];
  for (const keyword of input.keywords) {
    for (let index = 1; index <= input.limitPerKeyword; index += 1) {
      const digest = stableNumber(`${keyword}:${index}`);
      const result = buildCoupangCandidate(
        {
          product_name: `Seed candidate: ${keyword} #${index}`,
          raw_coupang_url: `https://www.coupang.com/vp/products/${digest}?itemId=${digest + 1}&vendorItemId=${digest + 2}`,
          selected_affiliate_url: "",
          thumbnail_url: `https://picsum.photos/seed/${encodeURIComponent(`candidate-${keyword}-${index}`)}/1080/1920`,
          price_now_text: "",
          category_path: "",
          source_type: "seed_plan_dry_run",
          source: input.source
        },
        {
          candidates: [...input.existingCandidates, ...candidates]
        }
      );
      candidates.push({
        ...result.candidate,
        payload: {
          ...result.candidate.payload,
          source_keyword: keyword,
          source_trace: {
            ...(result.candidate.payload.source_trace as Record<string, unknown> | undefined),
            source_keyword: keyword,
            collected_mode: "dry_run",
            source_name: input.source
          },
          candidate_only_execution: {
            dry_run: true,
            queue_creation_enabled: false,
            worker_job_creation_enabled: false,
            render_plan_creation_enabled: false,
            upload_package_creation_enabled: false,
            upload_enabled: false
          }
        }
      });
    }
  }
  return candidates;
}

function hasSafeFlags(input: CandidateOnlySeedExecutionInput) {
  return (
    text(input.mode) === "candidate_only" &&
    input.dry_run === true &&
    input.candidate_only === true &&
    input.queue_creation_enabled === false &&
    input.worker_job_creation_enabled === false &&
    input.render_plan_creation_enabled === false &&
    input.upload_package_creation_enabled === false &&
    input.upload_enabled === false
  );
}

function normalizeKeywords(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map(text).filter(Boolean))].slice(0, 50);
}

function normalizeLimit(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return 5;
  }
  return Math.max(1, Math.min(20, Math.floor(parsed)));
}

function errorResponse(
  errorCode: CandidateOnlySeedExecutionErrorCode,
  message: string,
  safeError: string,
  input: CandidateOnlySeedExecutionInput,
  status: 400 | 500
): CandidateOnlySeedExecutionResponse {
  return {
    ok: false,
    status,
    error_code: errorCode,
    message,
    safe_error: safeError,
    side_effects: NO_SIDE_EFFECTS,
    safety: {
      candidate_only: input.candidate_only === true,
      confirmation_required: true,
      confirmation_matched: text(input.confirmation) === CONFIRMATION
    }
  };
}

function stableNumber(value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 10);
  return 100000000 + (Number.parseInt(hex, 16) % 800000000);
}

function toInput(value: unknown): CandidateOnlySeedExecutionInput {
  return typeof value === "object" && value !== null ? value as CandidateOnlySeedExecutionInput : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
