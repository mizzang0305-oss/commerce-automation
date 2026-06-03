import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getRepositoryRuntimeInfo } from "@/lib/repositories/repositoryFactory";
import { getN8nConfigStatus } from "@/lib/server/n8nClient";
import { getSupabaseConfigStatus } from "@/lib/server/supabaseAdmin";
import { getAiProviderConfigStatus } from "@/lib/server/aiProviderConfig";
import { getDailyCapacity, getDailyCapacityWarning, getNextRunAt } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const settings = await getAutomationRepository().getSettings();
  const diagnostics = getN8nConfigStatus();

  return NextResponse.json({
    diagnostics,
    repository: {
      ...getRepositoryRuntimeInfo(),
      ...getSupabaseConfigStatus()
    },
    content_ai: getAiProviderConfigStatus(),
    nodeEnv: process.env.NODE_ENV,
    scheduler: {
      next_run_at: getNextRunAt(settings).toISOString(),
      daily_capacity: getDailyCapacity(settings),
      warning: getDailyCapacityWarning(settings)
    },
    safeSamplePayload: {
      mode: "generate_queue",
      requested_count: settings.daily_target_count,
      date_range_days: 30
    }
  });
}
