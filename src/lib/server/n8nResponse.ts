import "server-only";

export type ParsedN8nResponse = {
  ok: boolean;
  http_status?: number;
  request_id?: string;
  run_id?: string;
  processed_count: number;
  error_count: number;
  safe_summary: string;
};

const MAX_SUMMARY_LENGTH = 1200;

export function sanitizeN8nText(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/"(authorization|access_token|refresh_token|token|secret)"\s*:\s*"[^"]*"/gi, '"$1":"[redacted]"')
    .replace(/\b(access_token|refresh_token|token|secret)=([^&\s]+)/gi, "$1=[redacted]")
    .replace(/https?:\/\/[^\s"']*webhook[^\s"']*/gi, "[webhook-url-redacted]")
    .replace(/N8N_[A-Z_]+/g, "[env]")
    .slice(0, MAX_SUMMARY_LENGTH);
}

export function parseN8nResponse(
  responseBody: string,
  options: { httpStatus?: number; requestId?: string } = {}
): ParsedN8nResponse {
  const httpOk = options.httpStatus ? options.httpStatus >= 200 && options.httpStatus < 300 : true;

  try {
    const parsed = JSON.parse(responseBody) as Record<string, unknown>;
    const safeSummary = sanitizeN8nText(JSON.stringify(parsed));
    const ok = typeof parsed.ok === "boolean" ? parsed.ok : httpOk;

    return {
      ok,
      http_status: options.httpStatus,
      request_id: options.requestId,
      run_id: typeof parsed.run_id === "string" ? parsed.run_id : undefined,
      processed_count: typeof parsed.processed_count === "number" ? parsed.processed_count : 0,
      error_count: typeof parsed.error_count === "number" ? parsed.error_count : ok ? 0 : 1,
      safe_summary: safeSummary
    };
  } catch {
    const safeSummary = sanitizeN8nText(responseBody || "(empty response)");
    return {
      ok: httpOk,
      http_status: options.httpStatus,
      request_id: options.requestId,
      processed_count: 0,
      error_count: httpOk ? 0 : 1,
      safe_summary: safeSummary
    };
  }
}

export function toSafeRunLog(response: ParsedN8nResponse): string {
  return sanitizeN8nText(
    [
      `HTTP ${response.http_status ?? "-"}`,
      `ok=${response.ok}`,
      `request_id=${response.request_id ?? "-"}`,
      `run_id=${response.run_id ?? "-"}`,
      `processed_count=${response.processed_count}`,
      `error_count=${response.error_count}`,
      `summary=${response.safe_summary}`
    ].join(" | ")
  );
}
