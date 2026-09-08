import { describe, expect, test, vi } from "vitest";

import {
  createResumablePrivateUploadAdapter,
  type ResumablePrivateUploadRequest,
  type ResumableUploadTransport,
  type ResumableUploadTransportResponse
} from "../src/uploads/youtube/v2a/resumablePrivateUploadAdapter";
import { verifyYouTubeUploadReadback } from "../src/uploads/youtube/v2a/readbackVerifier";

const SESSION_URI =
  "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=sensitive-token";
const CHANNEL_ID = `UC${"a".repeat(22)}`;

describe("YouTube V2A resumable private upload adapter", () => {
  test("rejects any non-private upload before transport is called", async () => {
    const transport = vi.fn<ResumableUploadTransport>();
    const result = await adapter(transport).upload(request({ visibility: "public" }));

    expect(result).toEqual({
      status: "failed",
      code: "PRIVATE_VISIBILITY_REQUIRED",
      sessionCreated: false,
      ambiguous: false
    });
    expect(transport).not.toHaveBeenCalled();
  });

  test("rejects a non-official initiation URL and malformed upload identity", async () => {
    const transport = vi.fn<ResumableUploadTransport>();
    const invalidUrl = createResumablePrivateUploadAdapter({
      initiationUrl: "https://attacker.invalid/upload/youtube/v3/videos?uploadType=resumable",
      transport
    });

    await expect(invalidUrl.upload(request())).resolves.toMatchObject({
      status: "failed",
      code: "INVALID_UPLOAD_REQUEST"
    });
    await expect(adapter(transport).upload(request({ targetChannelId: "UCshort" }))).resolves
      .toMatchObject({ status: "failed", code: "INVALID_UPLOAD_REQUEST" });
    expect(transport).not.toHaveBeenCalled();
  });

  test("rejects an attacker-controlled session Location before forwarding authorization", async () => {
    const transport = scriptedTransport([
      response(200, undefined, { location: "https://attacker.invalid/session/token" })
    ]);

    const result = await adapter(transport).upload(
      request({ authorizationHeaders: { Authorization: "Bearer secret" } })
    );

    expect(result).toMatchObject({
      status: "failed",
      code: "SESSION_LOCATION_REJECTED",
      sessionCreated: false
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toMatchObject({ method: "POST" });
  });

  test("creates one session, resumes from 308 Range, and validates completion", async () => {
    const transport = scriptedTransport([
      response(200, undefined, { Location: SESSION_URI }),
      response(308, undefined, { Range: "bytes=0-1" }),
      response(200, {
        kind: "youtube#video",
        id: "video123456",
        status: { privacyStatus: "private" },
        snippet: { channelId: CHANNEL_ID }
      })
    ]);

    const result = await adapter(transport).upload(request());

    expect(result).toMatchObject({ status: "succeeded", videoId: "video123456" });
    expect(transport).toHaveBeenCalledTimes(3);
    expect(transport.mock.calls[0][0]).toMatchObject({ method: "POST" });
    expect(transport.mock.calls[1][0]).toMatchObject({
      method: "PUT",
      headers: { "Content-Range": "bytes 0-3/4" }
    });
    expect(transport.mock.calls[2][0]).toMatchObject({
      method: "PUT",
      headers: { "Content-Range": "bytes 2-3/4" }
    });
    expect(transport.mock.calls[2][0].body).toEqual(new Uint8Array([3, 4]));
    expect(JSON.stringify(result)).not.toContain(SESSION_URI);
  });

  test("probes the same session after a retryable response and honors Retry-After", async () => {
    const delays: number[] = [];
    const transport = scriptedTransport([
      response(200, undefined, { location: SESSION_URI }),
      response(503, undefined, { "Retry-After": "2" }),
      response(308, undefined, { Range: "bytes=0-1" }),
      response(200, {
        id: "video234567",
        status: { privacyStatus: "private" }
      })
    ]);

    const result = await adapter(transport, {
      delay: async (milliseconds) => {
        delays.push(milliseconds);
      }
    }).upload(request());

    expect(result.status).toBe("succeeded");
    expect(delays).toEqual([2_000]);
    expect(transport.mock.calls.filter(([call]) => call.method === "POST")).toHaveLength(1);
    expect(transport.mock.calls[2][0]).toMatchObject({
      method: "PUT",
      url: SESSION_URI,
      headers: { "Content-Length": "0", "Content-Range": "bytes */4" }
    });
  });

  test("treats 4xx as terminal without blind retry", async () => {
    const transport = scriptedTransport([
      response(200, undefined, { location: SESSION_URI }),
      response(403)
    ]);

    const result = await adapter(transport).upload(request());

    expect(result).toMatchObject({ status: "failed", code: "UPLOAD_REJECTED" });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  test("returns ambiguous after uncertain completion without starting another session", async () => {
    const transport = vi
      .fn<ResumableUploadTransport>()
      .mockResolvedValueOnce(response(200, undefined, { location: SESSION_URI }))
      .mockRejectedValue(new Error(`must not leak ${SESSION_URI}`));

    const result = await adapter(transport, {
      maxRetries: 1,
      delay: async () => undefined
    }).upload(request());

    expect(result).toEqual({
      status: "ambiguous",
      code: "UPLOAD_COMPLETION_AMBIGUOUS",
      sessionCreated: true,
      ambiguous: true
    });
    expect(transport.mock.calls.filter(([call]) => call.method === "POST")).toHaveLength(1);
    expect(JSON.stringify(result)).not.toContain(SESSION_URI);
  });
});

describe("YouTube V2A post-upload readback", () => {
  test("verifies exact identity, target channel, private visibility, title and description digest", async () => {
    const digestDescription = vi.fn(async (value: string) => `digest:${value.length}`);
    const result = await verifyYouTubeUploadReadback({
      expected: {
        videoId: "video123456",
        targetChannelId: CHANNEL_ID,
        title: "Exact title",
        descriptionDigest: "digest:16",
        tags: ["tag-1"],
        categoryId: "22",
        madeForKids: false
      },
      resource: {
        id: "video123456",
        snippet: {
          channelId: CHANNEL_ID,
          title: "Exact title",
          description: "safe description",
          tags: ["tag-1"],
          categoryId: "22"
        },
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false }
      },
      digestDescription
    });

    expect(result).toEqual({ ok: true, code: "READBACK_VERIFIED" });
    expect(digestDescription).toHaveBeenCalledWith("safe description");
    expect(JSON.stringify(result)).not.toContain("safe description");
  });

  test("fails closed on target-channel mismatch before digesting description", async () => {
    const digestDescription = vi.fn(async () => "digest:16");
    const result = await verifyYouTubeUploadReadback({
      expected: {
        videoId: "video123456",
        targetChannelId: CHANNEL_ID,
        title: "Exact title",
        descriptionDigest: "digest:16",
        tags: ["tag-1"],
        categoryId: "22",
        madeForKids: false
      },
      resource: {
        id: "video123456",
        snippet: {
          channelId: `UC${"b".repeat(22)}`,
          title: "Exact title",
          description: "safe description",
          tags: ["tag-1"],
          categoryId: "22"
        },
        status: { privacyStatus: "private", selfDeclaredMadeForKids: false }
      },
      digestDescription
    });

    expect(result).toEqual({ ok: false, code: "READBACK_TARGET_CHANNEL_MISMATCH" });
    expect(digestDescription).not.toHaveBeenCalled();
  });
});

function adapter(
  transport: ResumableUploadTransport,
  overrides: Partial<Parameters<typeof createResumablePrivateUploadAdapter>[0]> = {}
) {
  return createResumablePrivateUploadAdapter({
    initiationUrl:
      "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    transport,
    delay: async () => undefined,
    ...overrides
  });
}

function request(
  overrides: Partial<ResumablePrivateUploadRequest> = {}
): ResumablePrivateUploadRequest {
  return {
    visibility: "private" as const,
    title: "Exact title",
    description: "safe description",
    tags: ["tag-1"],
    categoryId: "22",
    madeForKids: false,
    targetChannelId: CHANNEL_ID,
    media: new Uint8Array([1, 2, 3, 4]),
    mimeType: "video/mp4",
    ...overrides
  };
}

function scriptedTransport(responses: ResumableUploadTransportResponse[]) {
  const queue = [...responses];
  return vi.fn<ResumableUploadTransport>(async () => {
    const next = queue.shift();
    if (!next) throw new Error("unexpected transport call");
    return next;
  });
}

function response(
  status: number,
  json?: unknown,
  headers?: Record<string, string>
): ResumableUploadTransportResponse {
  return { status, json, headers };
}
