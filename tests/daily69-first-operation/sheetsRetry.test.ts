import { describe, expect, it, vi } from "vitest";
import { NoUploadGoogleSheetsClient } from "../../src/lib/queue-control-integration/sheetsOnlyClient";

const config = {
  spreadsheetId: "sheet-id",
  serviceAccountEmail: "service@example.invalid",
  privateKey: "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n",
  driveVideoFolderId: "unused-no-upload-folder",
  credentialSource: "legacy" as const,
  keyFileOutsideRepo: true,
  keyFilePermissionsChecked: true,
  privateKeyParseReady: true,
};

describe("Daily69 Sheets-only bounded read retry", () => {
  it("retries transient 503 responses with bounded backoff and records sanitized attempts", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ sheets: [] }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new NoUploadGoogleSheetsClient(config, { getAccessToken: async () => "redacted-token", fetch: fetchMock, sleep });

    await expect(client.metadata()).resolves.toEqual({ sheets: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(client.sanitizedAttempts()).toEqual([
      { attempt: 1, method: "GET", write: false, status: 503, classification: "transient_http", retried: true },
      { attempt: 2, method: "GET", write: false, status: 200, classification: "success", retried: false },
    ]);
    expect(JSON.stringify(client.sanitizedAttempts())).not.toContain("redacted-token");
  });

  it("does not retry permanent auth or semantic HTTP failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 403 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new NoUploadGoogleSheetsClient(config, { getAccessToken: async () => "redacted-token", fetch: fetchMock, sleep });

    await expect(client.metadata()).rejects.toMatchObject({ code: "GOOGLE_SHEETS_READ_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(client.sanitizedAttempts()).toEqual([
      { attempt: 1, method: "GET", write: false, status: 403, classification: "permanent_http", retried: false },
    ]);
  });

  it("never retries writes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new NoUploadGoogleSheetsClient(config, { getAccessToken: async () => "redacted-token", fetch: fetchMock, sleep });

    await expect(client.appendValues("Queue", "A:Z", [["safe"]])).rejects.toMatchObject({ code: "GOOGLE_SHEETS_WRITE_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
