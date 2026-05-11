import { NextResponse } from "next/server";
import type { AutomationRunStatus } from "@/types/automation";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { verifyCallbackRequest } from "@/lib/server/callbackAuth";
import { normalizeCallbackQueueItem, sanitizeCallbackBody } from "@/lib/server/n8nCallback";
import { sanitizeN8nText } from "@/lib/server/n8nResponse";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = verifyCallbackRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status });
  }

  const body = sanitizeCallbackBody((await request.json()) as Record<string, unknown>);
  const repository = getAutomationRepository();
  const items = Array.isArray(body.items)
    ? body.items.map((item) => normalizeCallbackQueueItem(item as Record<string, unknown>))
    : [];
  if (items.length > 0) {
    await repository.upsertQueueItems(items);
  }

  const status = body.status === "success" ? "success" : "failed";
  await repository.appendRun(
    createAutomationRun({
      request_id: typeof body.request_id === "string" ? body.request_id : undefined,
      run_type: "nightly_scout",
      status: status as AutomationRunStatus,
      processed_count: typeof body.created_count === "number" ? body.created_count : items.length,
      error_count: status === "failed" ? 1 : 0,
      log: sanitizeN8nText(JSON.stringify(body)),
      safe_message:
        typeof body.error_message === "string" && body.error_message
          ? body.error_message
          : status === "success"
            ? "nightly scout callback 결과를 큐에 반영했습니다."
            : "nightly scout callback 처리에 실패했습니다."
    })
  );

  return NextResponse.json({ ok: true, message: "callback 결과를 반영했습니다.", upserted_count: items.length });
}
