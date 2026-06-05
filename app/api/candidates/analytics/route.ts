import { NextResponse } from "next/server";
import {
  buildCandidateAnalytics,
  normalizeCandidateAnalyticsFilters,
  validateCandidateAnalyticsFilters,
} from "@/lib/candidates/candidateAnalytics";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { candidateAnalyticsFilterSchema } from "@/lib/validation/operatorFormSchemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = candidateAnalyticsFilterSchema.safeParse(Object.fromEntries(url.searchParams.entries()));
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        status: 400,
        error_code: "INVALID_SCORE_RANGE",
        message: "Invalid candidate analytics filter range.",
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
  const filters = parsed.data;
  const appliedFilters = normalizeCandidateAnalyticsFilters(filters);
  const validation = validateCandidateAnalyticsFilters(appliedFilters);
  if (!validation.ok) {
    return NextResponse.json(validation, { status: validation.status });
  }
  const analytics = await buildCandidateAnalytics(getAutomationRepository(), filters);
  return NextResponse.json(analytics);
}
