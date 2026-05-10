import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { canProcessBatch } from "@/lib/guards";
import { buildN8nPayload, callN8nWebhook, getN8nConfigStatus } from "@/lib/server/n8nClient";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST() {
  const repository = getAutomationRepository();
  const settings = await repository.getSettings();
  const config = getN8nConfigStatus();

  if (!config.nextBatchConfigured || !config.secretConfigured) {
    const message = "n8n Webhook 설정이 없어 실행할 수 없습니다.";
    await repository.appendRun(
      createAutomationRun({
        run_type: "manual_batch",
        status: "failed",
        log: message,
        safe_message: message
      })
    );
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }

  const guard = canProcessBatch(settings);
  if (!guard.ok) {
    await repository.appendRun(
      createAutomationRun({
        run_type: "manual_batch",
        status: "failed",
        log: guard.message,
        safe_message: guard.message
      })
    );
    return NextResponse.json({ ok: false, message: guard.message }, { status: 409 });
  }

  const result = await callN8nWebhook("next_batch", buildN8nPayload("next_batch", { settings }));

  await repository.appendRun(
    createAutomationRun({
      run_type: "manual_batch",
      status: result.ok ? "success" : "failed",
      log: result.log,
      safe_message: result.message
    })
  );

  return NextResponse.json({ ok: result.ok, message: result.message }, { status: result.ok ? 200 : 503 });
}
