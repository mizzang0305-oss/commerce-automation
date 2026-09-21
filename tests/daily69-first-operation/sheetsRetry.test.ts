import { describe, expect, it, vi } from "vitest";
import { NoUploadGoogleSheetsClient, SHEETS_READ_MIN_INTERVAL_MS } from "../../src/lib/queue-control-integration/sheetsOnlyClient";

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
  it("paces concurrent GETs and retry attempts below60 perminute using a scoped injected clock", async () => {
    let now = 0;
    const requestTimes: number[] = [];
    let attempted = 0;
    const fetchMock = vi.fn(async () => {
      requestTimes.push(now);
      return ++attempted === 2 ? new Response("", { status: 429 }) : new Response(JSON.stringify({ sheets: [] }), { status: 200 });
    });
    const client = new NoUploadGoogleSheetsClient(config, { getAccessToken: async () => "fixture-token", fetch: fetchMock, now: () => now, sleep: async (delay) => { now += delay; } });
    await Promise.all(Array.from({ length: 70 }, () => client.metadata()));
    expect(requestTimes).toHaveLength(71);
    expect(requestTimes.every((time, index) => index === 0 || time - requestTimes[index - 1] >= SHEETS_READ_MIN_INTERVAL_MS)).toBe(true);
    expect(Math.max(...requestTimes.map((start) => requestTimes.filter((time) => time >= start && time < start + 60_000).length))).toBeLessThanOrEqual(55);
    const prior = now;
    await client.appendValues("Fixture", "A1:A1", [["local-only"]]);
    expect(now).toBe(prior);
  });
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
