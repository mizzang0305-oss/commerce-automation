import { NextResponse } from "next/server";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import { canGenerateQueue } from "@/lib/guards";
import { buildN8nPayload, getN8nConfigStatus, callN8nWebhook } from "@/lib/server/n8nClient";
import { createAutomationRun } from "@/lib/server/runLog";

export const dynamic = "force-dynamic";

export async function POST() {
  const repository = getAutomationRepository();
  const settings = await repository.getSettings();
  const config = getN8nConfigStatus();

  if (!config.nightlyScoutConfigured || !config.secretConfigured) {
    const message = "n8n Webhook 설정이 없어 실행할 수 없습니다.";
    await repository.appendRun(
      createAutomationRun({
        run_type: "nightly_scout",
        status: "failed",
        log: message,
        safe_message: message
      })
    );
    return NextResponse.json({ ok: false, message }, { status: 503 });
  }

  const guard = canGenerateQueue(settings);
  if (!guard.ok) {
    await repository.appendRun(
      createAutomationRun({
        run_type: "nightly_scout",
        status: "failed",
        log: guard.message,
        safe_message: guard.message
      })
    );
    return NextResponse.json({ ok: false, message: guard.message }, { status: 409 });
  }

  const result = await callN8nWebhook("nightly_scout", buildN8nPayload("nightly_scout", { settings }));

  await repository.appendRun(
    createAutomationRun({
      run_type: "nightly_scout",
      status: result.ok ? "success" : "failed",
      log: result.log,
      safe_message: result.message
    })
  );

  return NextResponse.json({ ok: result.ok, message: result.message }, { status: result.ok ? 200 : 503 });
}
