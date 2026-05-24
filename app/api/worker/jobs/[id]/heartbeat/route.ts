import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { getWorkerAuthError, verifyWorkerRequest } from "@/lib/server/workerAuth";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!verifyWorkerRequest(request)) {
    return NextResponse.json(getWorkerAuthError(), { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const workerId = typeof body.worker_id === "string" ? body.worker_id : "";
  if (!workerId) {
    return NextResponse.json({ ok: false, message: "worker_id is required." }, { status: 400 });
  }

  const job = await getAutomationRepository().updateWorkerJobHeartbeat(id, workerId);
  if (!job) {
    return NextResponse.json({ ok: false, message: "Job was not claimed by this worker." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, job });
}
