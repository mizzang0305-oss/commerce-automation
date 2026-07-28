import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runScheduledQueueIntegration } from "@/lib/coupang/scheduledQueueIntegration";
import {
  COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL
} from "@/lib/coupang/scheduledProductProvider";
import {
  COMMERCE_DAILY_KST_SLOTS,
  type CommerceDailySlotId
} from "@/lib/orchestration/commerceDailyCadence";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { POST as dispatchNextBatch } from "../../run/next-batch/route";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isAuthorized(request, process.env.SCHEDULED_PRIVATE_PILOT_API_SECRET)) {
    return NextResponse.json(safeBlocked("SCHEDULED_PRIVATE_PILOT_AUTH_REQUIRED"), { status: 401 });
  }
  const body = await request.json().catch(() => ({})) as { slot_id?: unknown };
  if (!isSlotId(body.slot_id)) {
    return NextResponse.json(safeBlocked("SCHEDULED_PRIVATE_PILOT_SLOT_INVALID"), { status: 400 });
  }
  if (process.env.SCHEDULED_PRIVATE_PILOT_ENABLED?.trim().toLowerCase() !== "true") {
    return NextResponse.json(safeBlocked("SCHEDULED_PRIVATE_PILOT_DISABLED"), { status: 409 });
  }

  const result = await runScheduledQueueIntegration({
    repository: getAutomationRepository(),
    slotId: body.slot_id,
    approval: COUPANG_SCHEDULED_PRODUCT_SEARCH_APPROVAL,
    env: process.env
  });
  let workerDispatch = {
    attempted: false,
    created_jobs: 0,
    guarded_items: 0,
    ok: false
  };
  if (result.ok) {
    const dispatchResponse = await dispatchNextBatch(
      new Request("http://internal/api/run/next-batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queue_id: result.queue_id })
      })
    );
    const dispatchPayload = await dispatchResponse.json() as {
      ok?: unknown;
      created_jobs?: unknown;
      guarded_items?: unknown;
    };
    workerDispatch = {
      attempted: true,
      created_jobs: number(dispatchPayload.created_jobs),
      guarded_items: number(dispatchPayload.guarded_items),
      ok: dispatchResponse.ok && dispatchPayload.ok === true
    };
  }
  return NextResponse.json(
    {
      ...result,
      worker_dispatch: workerDispatch,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false,
      PUBLIC_UPLOAD_ENABLED: false,
      UNLISTED_UPLOAD_ENABLED: false,
      COMMENT_AUTOMATION_ENABLED: false,
      MAX_PRIVATE_PILOT_ITEMS: 1,
      FAKE_SUCCESS: false
    },
    { status: result.ok && workerDispatch.ok && workerDispatch.created_jobs === 1 ? 200 : 409 }
  );
}

function isAuthorized(request: Request, configuredSecret: string | undefined) {
  const expected = configuredSecret?.trim() ?? "";
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (expected.length < 32 || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(expected, "utf8"));
}

function isSlotId(value: unknown): value is CommerceDailySlotId {
  return typeof value === "string" && COMMERCE_DAILY_KST_SLOTS.some((slot) => slot.id === value);
}

function safeBlocked(blocker: string) {
  return {
    ok: false,
    blocker,
    external_api_called: false,
    worker_job_created: false,
    upload_executor_called: false,
    videos_insert_called: false,
    raw_coupang_url_exposed: false
  };
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
