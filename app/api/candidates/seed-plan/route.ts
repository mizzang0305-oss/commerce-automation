import { NextResponse } from "next/server";
import {
  buildCandidateSeedDryRunPlan,
  normalizeCandidateAnalyticsFilters,
  validateCandidateAnalyticsFilters
} from "@/lib/candidates/candidateAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import {
  candidateAnalyticsFilterSchema,
  candidateSeedPlanOptionsSchema
} from "@/lib/validation/operatorFormSchemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parsedFilters = candidateAnalyticsFilterSchema.safeParse(params);
  if (!parsedFilters.success) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error_code: "INVALID_SCORE_RANGE",
        message: "Invalid candidate seed plan filter range.",
        side_effects: {
          collector_executed: false,
          queue_created: false,
          worker_jobs_created: false,
          upload_triggered: false
        }
      },
      { status: 400 }
    );
  }
  const parsedOptions = candidateSeedPlanOptionsSchema.safeParse(params);
  if (!parsedOptions.success) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error_code: "INVALID_SEED_PLAN_OPTIONS",
        message: "Invalid candidate seed plan options.",
        side_effects: {
          collector_executed: false,
          queue_created: false,
          worker_jobs_created: false,
          upload_triggered: false
        }
      },
      { status: 400 }
    );
  }
  const filters = parsedFilters.data;
  const appliedFilters = normalizeCandidateAnalyticsFilters(filters);
  const validation = validateCandidateAnalyticsFilters(appliedFilters);
  if (!validation.ok) {
    return NextResponse.json(validation, { status: validation.status });
  }
  const seedPlan = await buildCandidateSeedDryRunPlan(getAutomationRepository(), filters, {
    strategy: parsedOptions.data.strategy,
    max_keywords: parsedOptions.data.max_keywords,
    limit_per_keyword: parsedOptions.data.limit_per_keyword,
    include_keep: parsedOptions.data.include_keep,
    include_expand: parsedOptions.data.include_expand,
    include_review: parsedOptions.data.include_review,
    include_avoid: parsedOptions.data.include_avoid
  });
  return NextResponse.json(seedPlan);
}
