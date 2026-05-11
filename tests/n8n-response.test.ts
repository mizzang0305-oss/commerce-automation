import { describe, expect, test } from "vitest";
import { parseN8nResponse, toSafeRunLog } from "@/lib/server/n8nResponse";

describe("n8n response parser", () => {
  test("parses JSON workflow response", () => {
    const parsed = parseN8nResponse(
      JSON.stringify({
        ok: true,
        run_id: "n8n-execution-id",
        processed_count: 3,
        error_count: 0,
        items: [{ id: "queue-001" }]
      }),
      { httpStatus: 200, requestId: "req-1" }
    );

    expect(parsed.ok).toBe(true);
    expect(parsed.run_id).toBe("n8n-execution-id");
    expect(parsed.processed_count).toBe(3);
    expect(parsed.error_count).toBe(0);
    expect(parsed.request_id).toBe("req-1");
  });

  test("summarizes text response", () => {
    const parsed = parseN8nResponse("Workflow was started", { httpStatus: 200 });

    expect(parsed.ok).toBe(true);
    expect(parsed.safe_summary).toContain("Workflow was started");
  });

  test("redacts secrets, authorization, tokens, and webhook URLs from logs", () => {
    const parsed = parseN8nResponse(
      JSON.stringify({
        message: "ok",
        Authorization: "Bearer abc.def.secret",
        access_token: "token-123",
        refresh_token: "refresh-123",
        url: "https://n8n.example.com/webhook/sensitive"
      }),
      { httpStatus: 200 }
    );
    const log = toSafeRunLog(parsed);

    expect(log).not.toContain("abc.def.secret");
    expect(log).not.toContain("token-123");
    expect(log).not.toContain("refresh-123");
    expect(log).not.toContain("n8n.example.com/webhook/sensitive");
    expect(log).toContain("[redacted]");
  });
});
