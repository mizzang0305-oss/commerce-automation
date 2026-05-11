import type { AutomationRun, AutomationRunStatus, AutomationRunType } from "@/types/automation";

export function createAutomationRun(input: {
  request_id?: string;
  n8n_run_id?: string;
  http_status?: number;
  run_type: AutomationRunType;
  status: AutomationRunStatus;
  processed_count?: number;
  error_count?: number;
  started_at?: string;
  finished_at?: string;
  log: string;
  safe_message: string;
}): AutomationRun {
  const now = new Date().toISOString();
  return {
    id: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    request_id: input.request_id,
    n8n_run_id: input.n8n_run_id,
    http_status: input.http_status,
    run_type: input.run_type,
    status: input.status,
    processed_count: input.processed_count ?? 0,
    error_count: input.error_count ?? (input.status === "failed" ? 1 : 0),
    started_at: input.started_at ?? now,
    finished_at: input.finished_at ?? now,
    log: input.log,
    safe_message: input.safe_message
  };
}
