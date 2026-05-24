import { NextResponse } from "next/server";
import type { WorkerJobType } from "@/types/automation";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getWorkerAuthError, verifyWorkerRequest } from "@/lib/server/workerAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!verifyWorkerRequest(request)) {
    return NextResponse.json(getWorkerAuthError(), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const workerId = typeof body.worker_id === "string" ? body.worker_id : "";
  const requestedJobTypes = Array.isArray(body.job_types) ? body.job_types : ["video_render", "sheet_sync"];
  const jobTypes = requestedJobTypes.filter((jobType: unknown): jobType is WorkerJobType =>
    ["video_render", "sheet_sync"].includes(String(jobType))
  );

  if (!workerId || jobTypes.length === 0) {
    return NextResponse.json({ ok: false, message: "worker_id and job_types are required." }, { status: 400 });
  }

  const job = await getAutomationRepository().claimWorkerJob({ worker_id: workerId, job_types: jobTypes });
  return NextResponse.json({ ok: true, job });
}
