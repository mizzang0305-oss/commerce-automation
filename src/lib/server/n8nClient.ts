import "server-only";

import { getN8nConfigStatus, getN8nWebhookUrl, type N8nWebhookType } from "@/lib/server/env";
import { parseN8nResponse, sanitizeN8nText, toSafeRunLog } from "@/lib/server/n8nResponse";
import type { AutomationSettings, ProductQueueItem } from "@/types/automation";

export type N8nCallResult = {
  ok: boolean;
  code: string;
  message: string;
  httpStatus?: number;
  requestId?: string;
  runId?: string;
  processedCount: number;
  errorCount: number;
  safeSummary: string;
  log: string;
};

export type CallbackDescriptor = {
  url: string;
  method: "POST";
} | null;

export const SAFE_MISSING_MESSAGE = "n8n Webhook 설정이 없어 실행할 수 없습니다.";
export const SAFE_FAILED_MESSAGE = "자동화 엔진 호출에 실패했습니다. Webhook 설정과 실행 로그를 확인하세요.";
const SAFE_SUCCESS_MESSAGE = "n8n Webhook 호출이 완료되었습니다. 실제 처리 결과는 실행 로그에서 확인하세요.";

export { getN8nConfigStatus };

function createRequestId(type: N8nWebhookType) {
  return `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function callback(path: string): CallbackDescriptor {
  const baseUrl = process.env.PUBLIC_APP_BASE_URL;
  if (!baseUrl) {
    return null;
  }

  return {
    url: `${baseUrl.replace(/\/$/, "")}${path}`,
    method: "POST"
  };
}

export function buildN8nPayload(
  type: "nightly_scout",
  input: { settings: AutomationSettings }
): {
  type: "nightly_scout";
  request_id: string;
  requested_at: string;
  settings: AutomationSettings;
  requested_count: number;
  date_range_days: 30;
  mode: "generate_queue";
  callback: CallbackDescriptor;
};
export function buildN8nPayload(
  type: "next_batch",
  input: { settings: AutomationSettings }
): {
  type: "next_batch";
  request_id: string;
  requested_at: string;
  settings: AutomationSettings;
  batch_size: number;
  interval_hours: number;
  mode: "process_next_batch";
  callback: CallbackDescriptor;
};
export function buildN8nPayload(
  type: "retry_item",
  input: { settings: AutomationSettings; item: ProductQueueItem }
): {
  type: "retry_item";
  request_id: string;
  requested_at: string;
  item: ProductQueueItem;
  settings: AutomationSettings;
  mode: "retry_item";
  callback: CallbackDescriptor;
};
export function buildN8nPayload(
  type: "hold_item" | "skip_item",
  input: { settings: AutomationSettings; item: ProductQueueItem }
): {
  type: "hold_item" | "skip_item";
  request_id: string;
  requested_at: string;
  item: ProductQueueItem;
  settings: AutomationSettings;
  mode: "hold_item" | "skip_item";
  callback: CallbackDescriptor;
};
export function buildN8nPayload(
  type: N8nWebhookType,
  input: { settings: AutomationSettings; item?: ProductQueueItem }
) {
  const base = {
    request_id: createRequestId(type),
    requested_at: new Date().toISOString()
  };

  if (type === "nightly_scout") {
    return {
      type,
      ...base,
      settings: input.settings,
      requested_count: input.settings.daily_target_count,
      date_range_days: 30,
      mode: "generate_queue",
      callback: callback("/api/callback/n8n/nightly-scout")
    };
  }

  if (type === "next_batch") {
    return {
      type,
      ...base,
      settings: input.settings,
      batch_size: input.settings.batch_size,
      interval_hours: input.settings.interval_hours,
      mode: "process_next_batch",
      callback: callback("/api/callback/n8n/batch-result")
    };
  }

  return {
    type,
    ...base,
    item: input.item,
    settings: input.settings,
    mode: type,
    callback: callback("/api/callback/n8n/item-result")
  };
}

function getRequestId(payload: unknown) {
  if (typeof payload === "object" && payload && "request_id" in payload) {
    return String((payload as { request_id: unknown }).request_id);
  }
  return undefined;
}

export async function callN8nWebhook(type: N8nWebhookType, payload: unknown): Promise<N8nCallResult> {
  const url = getN8nWebhookUrl(type);
  const secret = process.env.N8N_WEBHOOK_SECRET;
  const requestId = getRequestId(payload);

  if (!url || !secret) {
    return {
      ok: false,
      code: "N8N_WEBHOOK_NOT_CONFIGURED",
      message: SAFE_MISSING_MESSAGE,
      requestId,
      processedCount: 0,
      errorCount: 1,
      safeSummary: SAFE_MISSING_MESSAGE,
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
    const parsed = parseN8nResponse(await response.text(), {
      httpStatus: response.status,
      requestId
    });
    const log = toSafeRunLog(parsed);

    if (!response.ok || !parsed.ok) {
      return {
        ok: false,
        code: "N8N_WEBHOOK_FAILED",
        message: SAFE_FAILED_MESSAGE,
        httpStatus: response.status,
        requestId,
        runId: parsed.run_id,
        processedCount: parsed.processed_count,
        errorCount: parsed.error_count,
        safeSummary: parsed.safe_summary,
        log
      };
    }

    return {
      ok: true,
      code: "N8N_WEBHOOK_OK",
      message: SAFE_SUCCESS_MESSAGE,
      httpStatus: response.status,
      requestId,
      runId: parsed.run_id,
      processedCount: parsed.processed_count,
      errorCount: parsed.error_count,
      safeSummary: parsed.safe_summary,
      log
    };
  } catch (error) {
    const safeSummary = sanitizeN8nText(error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      code: "N8N_WEBHOOK_FAILED",
      message: SAFE_FAILED_MESSAGE,
      requestId,
      processedCount: 0,
      errorCount: 1,
      safeSummary,
      log: safeSummary
    };
  }
}
