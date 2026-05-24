import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export async function GET() {
  const repository = getAutomationRepository();
  const [workers, jobs] = await Promise.all([
    repository.getWorkerHeartbeats(),
    repository.getWorkerJobs()
  ]);

  return NextResponse.json({
    workers,
    jobs: {
      total: jobs.length,
      pending: jobs.filter((job) => job.status === "pending").length,
      claimed: jobs.filter((job) => job.status === "claimed").length,
      processing: jobs.filter((job) => job.status === "processing").length,
      completed: jobs.filter((job) => job.status === "completed").length,
      failed: jobs.filter((job) => job.status === "failed").length,
      retry_wait: jobs.filter((job) => job.status === "retry_wait").length,
      cancelled: jobs.filter((job) => job.status === "cancelled").length
    }
  });
}
