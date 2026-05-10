import "server-only";

import { getN8nConfigStatus, getN8nWebhookUrl, type N8nWebhookType } from "@/lib/server/env";
import type { AutomationSettings, ProductQueueItem } from "@/types/automation";

export type N8nCallResult = {
  ok: boolean;
  code: string;
  message: string;
  httpStatus?: number;
  log: string;
};

const SAFE_MISSING_MESSAGE = "n8n Webhook 설정이 없어 실행할 수 없습니다.";
const SAFE_FAILED_MESSAGE = "자동화 엔진 호출에 실패했습니다. Webhook 설정과 실행 로그를 확인하세요.";

function sanitizeLog(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [redacted]")
    .replace(/N8N_[A-Z_]+/g, "[env]")
    .slice(0, 1200);
}

export { getN8nConfigStatus };

export function buildN8nPayload(
  type: "nightly_scout",
  input: { settings: AutomationSettings }
): {
  type: "nightly_scout";
  settings: AutomationSettings;
  requested_count: number;
  date_range_days: 30;
  run_mode: AutomationSettings["run_mode"];
};
export function buildN8nPayload(
  type: "next_batch",
  input: { settings: AutomationSettings }
): {
  type: "next_batch";
  settings: AutomationSettings;
  batch_size: number;
  interval_hours: number;
  run_mode: AutomationSettings["run_mode"];
};
export function buildN8nPayload(
  type: "retry_item",
  input: { settings: AutomationSettings; item: ProductQueueItem }
): {
  type: "retry_item";
  item: ProductQueueItem;
  settings: AutomationSettings;
};
export function buildN8nPayload(
  type: "hold_item" | "skip_item",
  input: { settings: AutomationSettings; item: ProductQueueItem }
): {
  type: "hold_item" | "skip_item";
  item: ProductQueueItem;
  settings: AutomationSettings;
};
export function buildN8nPayload(
  type: N8nWebhookType,
  input: { settings: AutomationSettings; item?: ProductQueueItem }
) {
  if (type === "nightly_scout") {
    return {
      type,
      settings: input.settings,
      requested_count: input.settings.daily_target_count,
      date_range_days: 30,
      run_mode: input.settings.run_mode
    };
  }

  if (type === "next_batch") {
    return {
      type,
      settings: input.settings,
      batch_size: input.settings.batch_size,
      interval_hours: input.settings.interval_hours,
      run_mode: input.settings.run_mode
    };
  }

  return {
    type,
    item: input.item,
    settings: input.settings
  };
}

export async function callN8nWebhook(type: N8nWebhookType, payload: unknown): Promise<N8nCallResult> {
  const url = getN8nWebhookUrl(type);
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (!url || !secret) {
    return {
      ok: false,
      code: "N8N_WEBHOOK_NOT_CONFIGURED",
      message: SAFE_MISSING_MESSAGE,
      log: SAFE_MISSING_MESSAGE
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`
      },
      body: JSON.stringify(payload)
    });
    const body = sanitizeLog(await response.text());
    const log = `HTTP ${response.status}: ${body}`;

    if (!response.ok) {
      return {
        ok: false,
        code: "N8N_WEBHOOK_FAILED",
        message: SAFE_FAILED_MESSAGE,
        httpStatus: response.status,
        log
      };
    }

    return {
      ok: true,
      code: "N8N_WEBHOOK_OK",
      message: "n8n Webhook 호출이 완료되었습니다. 실제 처리 결과는 실행 로그에서 확인하세요.",
      httpStatus: response.status,
      log
    };
  } catch (error) {
    return {
      ok: false,
      code: "N8N_WEBHOOK_FAILED",
      message: SAFE_FAILED_MESSAGE,
      log: sanitizeLog(error instanceof Error ? error.message : String(error))
    };
  }
}
