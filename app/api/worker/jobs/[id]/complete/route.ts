import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getWorkerAuthError, verifyWorkerRequest } from "@/lib/server/workerAuth";
import { validateSignedVideoWorkerCompletion } from "@/lib/server/workerCompletionGate";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!verifyWorkerRequest(request)) {
    return NextResponse.json(getWorkerAuthError(), { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const workerId = typeof body.worker_id === "string" ? body.worker_id : "";
  const result = isRecord(body.result) ? body.result : {};
  if (!workerId) {
    return NextResponse.json({ ok: false, message: "worker_id is required." }, { status: 400 });
  }

  const repository = getAutomationRepository();
  const existingJob = await repository.getWorkerJob(id);
  if (!existingJob) {
    return NextResponse.json({ ok: false, message: "Worker job not found." }, { status: 404 });
  }
  const completionGate = validateSignedVideoWorkerCompletion(existingJob, result);
  if (!completionGate.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: completionGate.blocker,
        uploaded_state_recorded: false,
        queue_video_ready_recorded: false
      },
      { status: 422 }
    );
  }

  const job = await repository.completeWorkerJob(id, workerId, result);
  if (!job) {
    return NextResponse.json({ ok: false, message: "Job was not claimed by this worker." }, { status: 404 });
  }
  if (job.status !== "completed") {
    return NextResponse.json({ ok: false, message: job.error_message, job }, { status: 422 });
  }

  return NextResponse.json({ ok: true, job });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
