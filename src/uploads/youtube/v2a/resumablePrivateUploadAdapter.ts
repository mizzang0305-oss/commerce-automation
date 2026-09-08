export type UploadVisibility = "private" | "unlisted" | "public";

export type ResumableUploadTransportRequest = {
  method: "POST" | "PUT";
  url: string;
  headers: Readonly<Record<string, string>>;
  body?: string | Uint8Array;
};

export type ResumableUploadTransportResponse = {
  status: number;
  headers?: Readonly<Record<string, string | undefined>>;
  json?: unknown;
};

export type ResumableUploadTransport = (
  request: ResumableUploadTransportRequest
) => Promise<ResumableUploadTransportResponse>;

export type ResumablePrivateUploadRequest = {
  visibility: UploadVisibility;
  title: string;
  description: string;
  tags: readonly string[];
  categoryId: string;
  madeForKids: boolean;
  targetChannelId: string;
  media: Uint8Array;
  mimeType: string;
  authorizationHeaders?: Readonly<Record<string, string>>;
};

export type ResumablePrivateUploadResult =
  | {
      status: "succeeded";
      videoId: string;
      visibility: "private";
      sessionCreated: true;
      ambiguous: false;
    }
  | {
      status: "failed";
      code: ResumableUploadFailureCode;
      sessionCreated: boolean;
      ambiguous: false;
    }
  | {
      status: "ambiguous";
      code: "UPLOAD_COMPLETION_AMBIGUOUS" | "SESSION_CREATION_AMBIGUOUS";
      sessionCreated: boolean;
      ambiguous: true;
    };

export type ResumableUploadFailureCode =
  | "PRIVATE_VISIBILITY_REQUIRED"
  | "INVALID_UPLOAD_REQUEST"
  | "SESSION_CREATION_REJECTED"
  | "SESSION_LOCATION_MISSING"
  | "SESSION_LOCATION_REJECTED"
  | "UPLOAD_REJECTED"
  | "UPLOAD_RESPONSE_INVALID";

export type ResumablePrivateUploadAdapterDependencies = {
  initiationUrl: string;
  transport: ResumableUploadTransport;
  delay?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
};

const RETRYABLE_STATUS = new Set([500, 502, 503, 504]);

export function createResumablePrivateUploadAdapter(
  dependencies: ResumablePrivateUploadAdapterDependencies
) {
  const delay = dependencies.delay ?? defaultDelay;
  const now = dependencies.now ?? Date.now;
  const maxRetries = clampNonNegativeInteger(dependencies.maxRetries ?? 3);
  const baseDelayMs = Math.max(0, dependencies.baseDelayMs ?? 250);
  const maxDelayMs = Math.max(baseDelayMs, dependencies.maxDelayMs ?? 4_000);

  return {
    async upload(
      request: ResumablePrivateUploadRequest
    ): Promise<ResumablePrivateUploadResult> {
      if (request.visibility !== "private") {
        return failed("PRIVATE_VISIBILITY_REQUIRED", false);
      }
      if (!isValidRequest(request) || !isOfficialInitiationUrl(dependencies.initiationUrl)) {
        return failed("INVALID_UPLOAD_REQUEST", false);
      }

      const sessionResponse = await createSession();
      if (sessionResponse.kind === "ambiguous") {
        return ambiguous("SESSION_CREATION_AMBIGUOUS", false);
      }
      if (sessionResponse.kind === "failed") {
        return failed(sessionResponse.code, false);
      }

      const sessionUri = sessionResponse.sessionUri;
      let offset = 0;
      let retryCount = 0;

      while (true) {
        let response: ResumableUploadTransportResponse;
        try {
          response = await dependencies.transport({
            method: "PUT",
            url: sessionUri,
            headers: {
              ...request.authorizationHeaders,
              "Content-Length": String(request.media.byteLength - offset),
              "Content-Type": request.mimeType,
              "Content-Range": contentRange(offset, request.media.byteLength)
            },
            body: request.media.slice(offset)
          });
        } catch {
          const recovery = await recoverUncertainProgress(retryCount);
          if (recovery.kind === "complete") return recovery.result;
          if (recovery.kind === "terminal") return recovery.result;
          if (recovery.kind === "ambiguous") {
            return ambiguous("UPLOAD_COMPLETION_AMBIGUOUS", true);
          }
          offset = recovery.offset;
          retryCount = recovery.retryCount;
          continue;
        }

        if (isSuccessful(response.status)) {
          return validateCompletedResource(response.json, request.targetChannelId);
        }
        if (response.status === 308) {
          const nextOffset = parseNextOffset(getHeader(response.headers, "range"));
          if (nextOffset === null || nextOffset > request.media.byteLength) {
            return ambiguous("UPLOAD_COMPLETION_AMBIGUOUS", true);
          }
          offset = nextOffset;
          retryCount = 0;
          continue;
        }
        if (isTerminalClientError(response.status)) {
          return failed("UPLOAD_REJECTED", true);
        }
        if (!RETRYABLE_STATUS.has(response.status)) {
          return failed("UPLOAD_REJECTED", true);
        }

        const recovery = await recoverUncertainProgress(retryCount, response);
        if (recovery.kind === "complete") return recovery.result;
        if (recovery.kind === "terminal") return recovery.result;
        if (recovery.kind === "ambiguous") {
          return ambiguous("UPLOAD_COMPLETION_AMBIGUOUS", true);
        }
        offset = recovery.offset;
        retryCount = recovery.retryCount;
      }

      async function recoverUncertainProgress(
        retriesUsed: number,
        retryResponse?: ResumableUploadTransportResponse
      ): Promise<
        | { kind: "continue"; offset: number; retryCount: number }
        | { kind: "complete"; result: ResumablePrivateUploadResult }
        | { kind: "terminal"; result: ResumablePrivateUploadResult }
        | { kind: "ambiguous" }
      > {
        if (retriesUsed >= maxRetries) return { kind: "ambiguous" };
        await delay(retryDelay(retriesUsed, retryResponse));

        let probe: ResumableUploadTransportResponse;
        try {
          probe = await dependencies.transport({
            method: "PUT",
            url: sessionUri,
            headers: {
              ...request.authorizationHeaders,
              "Content-Length": "0",
              "Content-Range": `bytes */${request.media.byteLength}`
            }
          });
        } catch {
          return {
            kind: "continue",
            offset,
            retryCount: retriesUsed + 1
          };
        }

        if (isSuccessful(probe.status)) {
          return {
            kind: "complete",
            result: validateCompletedResource(probe.json, request.targetChannelId)
          };
        }
        if (probe.status === 308) {
          const nextOffset = parseNextOffset(getHeader(probe.headers, "range"));
          return nextOffset !== null && nextOffset <= request.media.byteLength
            ? { kind: "continue", offset: nextOffset, retryCount: retriesUsed + 1 }
            : { kind: "ambiguous" };
        }
        if (isTerminalClientError(probe.status)) {
          return { kind: "terminal", result: failed("UPLOAD_REJECTED", true) };
        }
        return {
          kind: "continue",
          offset,
          retryCount: retriesUsed + 1
        };
      }

      function retryDelay(
        retryIndex: number,
        response?: ResumableUploadTransportResponse
      ): number {
        const retryAfter = parseRetryAfter(
          getHeader(response?.headers, "retry-after"),
          now()
        );
        return retryAfter ?? Math.min(maxDelayMs, baseDelayMs * 2 ** retryIndex);
      }

      async function createSession(): Promise<
        | { kind: "created"; sessionUri: string }
        | { kind: "failed"; code: ResumableUploadFailureCode }
        | { kind: "ambiguous" }
      > {
        for (let retryCount = 0; ; retryCount += 1) {
          let response: ResumableUploadTransportResponse;
          try {
            response = await dependencies.transport({
              method: "POST",
              url: dependencies.initiationUrl,
              headers: {
                ...request.authorizationHeaders,
                "Content-Type": "application/json; charset=UTF-8",
                "X-Upload-Content-Length": String(request.media.byteLength),
                "X-Upload-Content-Type": request.mimeType
              },
              body: JSON.stringify({
                snippet: {
                  title: request.title,
                  description: request.description,
                  tags: request.tags,
                  categoryId: request.categoryId
                },
                status: {
                  privacyStatus: "private",
                  selfDeclaredMadeForKids: request.madeForKids
                }
              })
            });
          } catch {
            // A timed-out POST may already have created a session. Starting another
            // one risks duplicate uploads, so fail closed without a blind retry.
            return { kind: "ambiguous" };
          }
          if (isTerminalClientError(response.status)) {
            return { kind: "failed", code: "SESSION_CREATION_REJECTED" };
          }
          if (RETRYABLE_STATUS.has(response.status) && retryCount < maxRetries) {
            await delay(retryDelay(retryCount, response));
            continue;
          }
          if (!isSuccessful(response.status)) {
            return { kind: "failed", code: "SESSION_CREATION_REJECTED" };
          }
          const sessionUri = getHeader(response.headers, "location");
          if (!sessionUri) {
            return { kind: "failed", code: "SESSION_LOCATION_MISSING" };
          }
          return isOfficialSessionUrl(sessionUri)
            ? { kind: "created", sessionUri }
            : { kind: "failed", code: "SESSION_LOCATION_REJECTED" };
        }
      }
    }
  };
}

function isValidRequest(request: ResumablePrivateUploadRequest): boolean {
  return Boolean(
    request.title &&
      !hasControlCharacters(request.title) &&
      !hasControlCharacters(request.description) &&
      request.tags.length <= 25 &&
      request.tags.every((tag) => tag.length > 0 && tag.length <= 60 && !hasControlCharacters(tag)) &&
      /^\d{1,3}$/.test(request.categoryId) &&
      typeof request.madeForKids === "boolean" &&
      /^UC[A-Za-z0-9_-]{22}$/.test(request.targetChannelId) &&
      request.mimeType === "video/mp4" &&
      request.media.byteLength > 0
  );
}

function isOfficialInitiationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "www.googleapis.com" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname === "/upload/youtube/v3/videos" &&
      url.searchParams.get("uploadType") === "resumable" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function isOfficialSessionUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const validHost =
      url.hostname === "www.googleapis.com" ||
      url.hostname === "youtube.googleapis.com" ||
      url.hostname === "upload.youtube.com";
    const validPath =
      url.pathname === "/upload/youtube/v3/videos" ||
      url.pathname === "/resumable/upload/youtube/v3/videos";
    return (
      url.protocol === "https:" &&
      validHost &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      validPath &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function validateCompletedResource(
  value: unknown,
  expectedChannelId: string
): ResumablePrivateUploadResult {
  if (!isRecord(value)) return failed("UPLOAD_RESPONSE_INVALID", true);
  const id = typeof value.id === "string" ? value.id : "";
  const kind = value.kind;
  const status = isRecord(value.status) ? value.status : null;
  const snippet = isRecord(value.snippet) ? value.snippet : null;
  if (
    !/^[A-Za-z0-9_-]{11}$/.test(id) ||
    (kind !== undefined && kind !== "youtube#video") ||
    status?.privacyStatus !== "private" ||
    (snippet?.channelId !== undefined && snippet.channelId !== expectedChannelId)
  ) {
    return failed("UPLOAD_RESPONSE_INVALID", true);
  }
  return {
    status: "succeeded",
    videoId: id,
    visibility: "private",
    sessionCreated: true,
    ambiguous: false
  };
}

function contentRange(offset: number, total: number): string {
  return `bytes ${offset}-${total - 1}/${total}`;
}

function parseNextOffset(range: string | undefined): number | null {
  if (!range) return 0;
  const match = /^bytes=\d+-(\d+)$/.exec(range.trim());
  if (!match) return null;
  const lastByte = Number(match[1]);
  return Number.isSafeInteger(lastByte) && lastByte >= 0 ? lastByte + 1 : null;
}

function parseRetryAfter(value: string | undefined, nowMs: number): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value.trim())) return Number(value.trim()) * 1_000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}

function getHeader(
  headers: Readonly<Record<string, string | undefined>> | undefined,
  name: string
): string | undefined {
  if (!headers) return undefined;
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase()
  );
  return match?.[1];
}

function isSuccessful(status: number): boolean {
  return status >= 200 && status < 300;
}

function isTerminalClientError(status: number): boolean {
  return status >= 400 && status < 500;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function failed(
  code: ResumableUploadFailureCode,
  sessionCreated: boolean
): ResumablePrivateUploadResult {
  return { status: "failed", code, sessionCreated, ambiguous: false };
}

function ambiguous(
  code: "UPLOAD_COMPLETION_AMBIGUOUS" | "SESSION_CREATION_AMBIGUOUS",
  sessionCreated: boolean
): ResumablePrivateUploadResult {
  return { status: "ambiguous", code, sessionCreated, ambiguous: true };
}

function defaultDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
