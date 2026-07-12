import crypto from "node:crypto";
import { describe, expect, test, vi } from "vitest";

import {
  uploadVideoBufferToR2
} from "../src/lib/uploads/videoAssets/oneProductServerAssetRegistration";

const SECRET = "v114-secret-key-value";
const ACCESS_KEY = "v114-access-key-value";
const RAW_ENDPOINT = "https://account-id.r2.cloudflarestorage.com";
const RAW_BODY_NEEDLE = "raw-provider-message-must-not-escape";

describe("V114 R2 PUT diagnostics no-upload", () => {
  test.each([
    [403, "AccessDenied", "R2_ACCESS_DENIED"],
    [403, "InvalidAccessKeyId", "R2_INVALID_ACCESS_KEY_ID"],
    [403, "SignatureDoesNotMatch", "R2_SIGNATURE_DOES_NOT_MATCH"],
    [403, "RequestTimeTooSkewed", "R2_REQUEST_TIME_TOO_SKEWED"],
    [404, "NoSuchBucket", "R2_NO_SUCH_BUCKET"],
    [404, "NoSuchKey", "R2_NO_SUCH_KEY"],
    [400, "InvalidRequest", "R2_INVALID_REQUEST"],
    [408, "RequestTimeout", "R2_REQUEST_TIMEOUT"],
    [429, "SlowDown", "R2_RATE_LIMITED"],
    [500, "InternalError", "R2_INTERNAL_ERROR"],
    [503, "ServiceUnavailable", "R2_SERVICE_UNAVAILABLE"]
  ])("preserves HTTP %s as allowlisted %s without raw response data", async (status, providerCode, safeCode) => {
    const fetchImpl = vi.fn(async () => new Response(
      `<Error><Code>${providerCode}</Code><Message>${RAW_BODY_NEEDLE}</Message></Error>`,
      { status }
    ));

    const result = await uploadVideoBufferToR2(uploadInput(), {
      env: readyEnv(),
      fetchImpl,
      now: () => new Date("2026-07-12T00:00:00.000Z")
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked R2 PUT");
    expect(result.diagnostics).toMatchObject({
      provider: "r2",
      operation: "put_object",
      request_attempted: true,
      http_status: status,
      safe_error_code: safeCode,
      raw_response_body_printed: false,
      raw_request_url_printed: false,
      auth_header_value_printed: false,
      credentials_printed: false
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expectSafeDiagnostics(result);
  });

  test.each([
    [403, "R2_PERMISSION_REJECTED"],
    [404, "R2_BUCKET_OR_OBJECT_NOT_FOUND"],
    [409, "R2_REQUEST_CONFLICT"],
    [429, "R2_RATE_LIMITED"],
    [500, "R2_HTTP_SERVER_ERROR"],
    [418, "R2_HTTP_CLIENT_ERROR"]
  ])("uses a safe status class for unknown HTTP %s response bodies", async (status, safeCode) => {
    const fetchImpl = vi.fn(async () => new Response(
      `<Error><Code>Unknown_${RAW_BODY_NEEDLE}</Code></Error>`,
      { status }
    ));
    const result = await uploadVideoBufferToR2(uploadInput(), {
      env: readyEnv(),
      fetchImpl
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked R2 PUT");
    expect(result.diagnostics.http_status).toBe(status);
    expect(result.diagnostics.safe_error_code).toBe(safeCode);
    expectSafeDiagnostics(result);
  });

  test("preserves network failure without exception text or credentials", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(`${RAW_BODY_NEEDLE} ${SECRET}`);
    });
    const result = await uploadVideoBufferToR2(uploadInput(), {
      env: readyEnv(),
      fetchImpl
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected blocked R2 PUT");
    expect(result.diagnostics).toMatchObject({
      request_attempted: true,
      http_status: null,
      safe_error_code: "R2_NETWORK_ERROR"
    });
    expectSafeDiagnostics(result);
  });

  test("missing configuration blocks before fetch", async () => {
    const fetchImpl = vi.fn();
    const result = await uploadVideoBufferToR2(uploadInput(), {
      env: {},
      fetchImpl
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected configuration block");
    expect(result.diagnostics).toMatchObject({
      request_attempted: false,
      http_status: null,
      safe_error_code: "R2_CONFIGURATION_ERROR"
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expectSafeDiagnostics(result);
  });

  test("keeps the existing PUT request shape and reports mocked success only", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));
    const input = uploadInput();
    const result = await uploadVideoBufferToR2(input, {
      env: readyEnv(),
      fetchImpl,
      now: () => new Date("2026-07-12T01:02:03.000Z")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected mocked R2 success");
    expect(result.diagnostics).toMatchObject({
      request_attempted: true,
      http_status: 204,
      safe_error_code: null
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchImpl.mock.calls[0];
    expect(String(requestUrl)).toContain("/rendered-videos/real-products/");
    expect(requestInit?.method).toBe("PUT");
    const headers = requestInit?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("video/mp4");
    expect(headers["Content-Length"]).toBe(String(input.size_bytes));
    expect(headers["x-amz-content-sha256"]).toBe(input.checksum_sha256);
    expect(headers.Authorization).toMatch(/^AWS4-HMAC-SHA256 /);
    expect(Buffer.from(requestInit?.body as Uint8Array)).toEqual(input.file_buffer);
    expectSafeDiagnostics(result);
  });
});

function uploadInput() {
  const fileBuffer = Buffer.from("v114-r2-put-body");
  return {
    candidateId: "queue-v114-father",
    file_buffer: fileBuffer,
    file_name: "corrected-preview-v057.mp4",
    mime_type: "video/mp4" as const,
    size_bytes: fileBuffer.byteLength,
    checksum_sha256: crypto.createHash("sha256").update(fileBuffer).digest("hex")
  };
}

function readyEnv(): NodeJS.ProcessEnv {
  return {
    R2_ENDPOINT_URL: RAW_ENDPOINT,
    R2_ACCESS_KEY_ID: ACCESS_KEY,
    R2_SECRET_ACCESS_KEY: SECRET,
    R2_RENDERED_VIDEOS_BUCKET: "rendered-videos",
    R2_PUBLIC_BASE_URL_RENDERED_VIDEOS: "https://assets.example.test"
  };
}

function expectSafeDiagnostics(result: unknown) {
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain(RAW_BODY_NEEDLE);
  expect(serialized).not.toContain(SECRET);
  expect(serialized).not.toContain(ACCESS_KEY);
  expect(serialized).not.toContain(RAW_ENDPOINT);
  expect(serialized).not.toMatch(/Authorization|Signature=|Credential=/i);
}
