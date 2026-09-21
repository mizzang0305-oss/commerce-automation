import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { FileYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/fileStore";
import {
  runYouTubePublicPublisherOnce,
  type YouTubePublicPublisherClient,
  type YouTubePublicPublisherRunResult,
  type YouTubePublicPublisherState
} from "@/lib/youtube-public-publisher/publisher";
import { createYouTubePublicPublisherClient } from "@/lib/youtube-public-publisher/youtubeApiClient";
import type { PublisherEnvironment } from "@/lib/youtube-public-publisher/channelConfig";

type ConfiguredPublisherInput = {
  cwd?: string;
  env?: PublisherEnvironment;
  client?: YouTubePublicPublisherClient;
  now?: string;
  claimOwner?: string;
};

export type ConfiguredPublisherRunResult = YouTubePublicPublisherRunResult | {
  status: "configuration_error";
  jobId: null;
  safeError: string;
  videosInsertCalls: 0;
  canariesImported: 0;
};

export async function runConfiguredYouTubePublicPublisherOnce(
  input: ConfiguredPublisherInput = {}
): Promise<ConfiguredPublisherRunResult> {
  const env = input.env ?? process.env;
  const cwd = resolve(input.cwd ?? process.cwd());
  const statePath = env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH?.trim() ?? "";
  if (!statePath || !isAbsolute(statePath)) {
    return configurationError("YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH_NOT_ABSOLUTE");
  }
  if (isPathInside(resolve(statePath), cwd)) {
    return configurationError("YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH_INSIDE_REPOSITORY");
  }

  const store = new FileYouTubePublicPublisherStore<YouTubePublicPublisherState>(statePath, { jobs: [], ledger: [] });
  return runYouTubePublicPublisherOnce({
    store,
    client: input.client ?? createYouTubePublicPublisherClient({ env, repositoryRoot: cwd }),
    getVideoSha256,
    env,
    now: input.now,
    claimOwner: input.claimOwner ?? `youtube-public-publisher-${process.pid}`
  });
}

async function getVideoSha256(videoPath: string) {
  try {
    const bytes = await readFile(videoPath);
    return createHash("sha256").update(bytes).digest("hex");
  } catch {
    return null;
  }
}

function isPathInside(candidate: string, parent: string) {
  const pathRelative = relative(parent, candidate);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative));
}

function configurationError(safeError: string): ConfiguredPublisherRunResult {
  return {
    status: "configuration_error",
    jobId: null,
    safeError,
    videosInsertCalls: 0,
    canariesImported: 0
  };
}
