import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import type { YouTubePublicPublisherClient } from "@/lib/youtube-public-publisher/publisher";
import type { PublisherEnvironment } from "@/lib/youtube-public-publisher/channelConfig";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const CHANNELS_MINE_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true";
const VIDEOS_INSERT_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable";
const VIDEOS_READBACK_ENDPOINT = "https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=";

type YouTubePublicPublisherClientOptions = {
  env?: PublisherEnvironment;
  fetchImpl?: typeof fetch;
  readTokenFile?: (path: string) => Promise<string>;
  readVideoFile?: (path: string) => Promise<Buffer>;
  repositoryRoot?: string;
};

export function createYouTubePublicPublisherClient(
  options: YouTubePublicPublisherClientOptions = {}
): YouTubePublicPublisherClient {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const readTokenFile = options.readTokenFile ?? ((path: string) => readFile(path, "utf8"));
  const readVideoFile = options.readVideoFile ?? ((path: string) => readFile(path));

  return {
    async getAccessToken(input) {
      const clientId = env.YOUTUBE_CLIENT_ID?.trim() ?? "";
      const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim() ?? "";
      if (!clientId || !clientSecret || !input.tokenFilePath.trim()) {
        return { ok: false, safeError: "YOUTUBE_CHANNEL_TOKEN_PROVIDER_NOT_CONFIGURED" };
      }
      if (!isExternalTokenPath(input.tokenFilePath, options.repositoryRoot ?? process.cwd())) {
        return { ok: false, safeError: "YOUTUBE_CHANNEL_TOKEN_PATH_INVALID" };
      }

      let refreshToken = "";
      try {
        refreshToken = readRefreshToken(await readTokenFile(input.tokenFilePath));
      } catch {
        return { ok: false, safeError: "YOUTUBE_CHANNEL_TOKEN_UNAVAILABLE" };
      }
      if (!refreshToken) {
        return { ok: false, safeError: "YOUTUBE_CHANNEL_REFRESH_TOKEN_UNAVAILABLE" };
      }

      try {
        const response = await fetchImpl(TOKEN_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token"
          })
        });
        if (!response.ok) {
          return { ok: false, safeError: `YOUTUBE_TOKEN_REFRESH_HTTP_${response.status}` };
        }
        const payload = await readJson(response);
        const accessToken = stringValue(payload.access_token);
        return accessToken
          ? { ok: true, accessToken }
          : { ok: false, safeError: "YOUTUBE_TOKEN_REFRESH_ACCESS_TOKEN_MISSING" };
      } catch {
        return { ok: false, safeError: "YOUTUBE_TOKEN_REFRESH_NETWORK_FAILURE" };
      }
    },

    async probeMineChannel(input) {
      try {
        const response = await fetchImpl(CHANNELS_MINE_ENDPOINT, {
          headers: authorizationHeaders(input.accessToken)
        });
        if (!response.ok) {
          return { ok: false, safeError: `YOUTUBE_CHANNEL_PROBE_HTTP_${response.status}` };
        }
        const payload = await readJson(response);
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (items.length !== 1) {
          return { ok: false, safeError: "YOUTUBE_CHANNEL_PROBE_COUNT_INVALID" };
        }
        const item = recordValue(items[0]);
        const snippet = recordValue(item.snippet);
        const channelId = stringValue(item.id);
        const channelTitle = stringValue(snippet.title);
        return channelId && channelTitle
          ? { ok: true, channelId, channelTitle }
          : { ok: false, safeError: "YOUTUBE_CHANNEL_PROBE_RESPONSE_INVALID" };
      } catch {
        return { ok: false, safeError: "YOUTUBE_CHANNEL_PROBE_NETWORK_FAILURE" };
      }
    },

    async insertPublicVideo(input) {
      let bytes: Buffer;
      try {
        bytes = await readVideoFile(input.videoPath);
      } catch {
        return { ok: false, safeError: "YOUTUBE_VIDEO_FILE_UNAVAILABLE", retryable: false };
      }
      if (bytes.byteLength <= 0) {
        return { ok: false, safeError: "YOUTUBE_VIDEO_FILE_EMPTY", retryable: false };
      }
      if (createHash("sha256").update(bytes).digest("hex").toLowerCase() !== input.videoSha256.trim().toLowerCase()) {
        return { ok: false, safeError: "YOUTUBE_VIDEO_HASH_MISMATCH", retryable: false };
      }

      let session: Response;
      try {
        session = await fetchImpl(VIDEOS_INSERT_ENDPOINT, {
          method: "POST",
          headers: {
            ...authorizationHeaders(input.accessToken),
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/mp4",
            "X-Upload-Content-Length": String(bytes.byteLength)
          },
          body: JSON.stringify({
            snippet: { title: input.title, description: input.description },
            status: { privacyStatus: "public", selfDeclaredMadeForKids: false }
          })
        });
      } catch {
        return { ok: false, safeError: "YOUTUBE_UPLOAD_SESSION_NETWORK_FAILURE", retryable: true };
      }
      if (!session.ok) {
        return {
          ok: false,
          safeError: `YOUTUBE_UPLOAD_SESSION_HTTP_${session.status}`,
          retryable: session.status >= 500 || session.status === 429
        };
      }
      const uploadUrl = session.headers.get("Location")?.trim() ?? "";
      if (!uploadUrl) {
        return { ok: false, safeError: "YOUTUBE_UPLOAD_SESSION_LOCATION_MISSING", retryable: false };
      }

      try {
        const upload = await fetchImpl(uploadUrl, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "video/mp4",
            "Content-Length": String(bytes.byteLength)
          },
          body: Uint8Array.from(bytes)
        });
        if (!upload.ok) {
          return { ok: false, safeError: `YOUTUBE_UPLOAD_BYTES_HTTP_${upload.status}`, retryable: false };
        }
        const payload = await readJson(upload);
        const youtubeVideoId = stringValue(payload.id);
        return youtubeVideoId
          ? { ok: true, youtubeVideoId }
          : { ok: false, safeError: "YOUTUBE_UPLOAD_RESPONSE_ID_MISSING", retryable: false };
      } catch {
        return { ok: false, safeError: "YOUTUBE_UPLOAD_BYTES_NETWORK_FAILURE", retryable: false };
      }
    },

    async readbackVideo(input) {
      try {
        const response = await fetchImpl(`${VIDEOS_READBACK_ENDPOINT}${encodeURIComponent(input.youtubeVideoId)}`, {
          headers: authorizationHeaders(input.accessToken)
        });
        if (!response.ok) {
          return { ok: false, safeError: `YOUTUBE_READBACK_HTTP_${response.status}` };
        }
        const payload = await readJson(response);
        const items = Array.isArray(payload.items) ? payload.items : [];
        if (items.length !== 1) {
          return { ok: false, safeError: "YOUTUBE_READBACK_COUNT_INVALID" };
        }
        const item = recordValue(items[0]);
        const snippet = recordValue(item.snippet);
        const status = recordValue(item.status);
        const channelId = stringValue(snippet.channelId);
        const privacyStatus = stringValue(status.privacyStatus);
        const title = stringValue(snippet.title);
        const description = stringValue(snippet.description);
        return channelId && privacyStatus && title && description
          ? { ok: true, channelId, privacyStatus, title, description }
          : { ok: false, safeError: "YOUTUBE_READBACK_RESPONSE_INVALID" };
      } catch {
        return { ok: false, safeError: "YOUTUBE_READBACK_NETWORK_FAILURE" };
      }
    }
  };
}

function authorizationHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

async function readJson(response: Response) {
  try {
    return recordValue(await response.json());
  } catch {
    return {};
  }
}

function readRefreshToken(source: string) {
  const parsed = recordValue(JSON.parse(source));
  return stringValue(parsed.refresh_token);
}

function recordValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isExternalTokenPath(tokenFilePath: string, repositoryRoot: string) {
  if (!isAbsolute(tokenFilePath)) {
    return false;
  }
  const pathRelative = relative(resolve(repositoryRoot), resolve(tokenFilePath));
  return pathRelative !== "" && (pathRelative.startsWith("..") || isAbsolute(pathRelative));
}
