export const YOUTUBE_PUBLIC_PUBLISHER_CHANNEL_KEYS = ["neoman_moleulgeol", "father_jobs"] as const;

export type YouTubePublicPublisherChannelKey = (typeof YOUTUBE_PUBLIC_PUBLISHER_CHANNEL_KEYS)[number];
export type PublisherEnvironment = Readonly<Record<string, string | undefined>>;

export type PublisherChannelRoute = {
  channelKey: YouTubePublicPublisherChannelKey;
  expectedChannelId: string;
  expectedChannelTitle: string;
  tokenFilePath: string;
};

const CHANNEL_CONFIG: Record<YouTubePublicPublisherChannelKey, {
  expectedChannelId: string;
  expectedChannelTitle: string;
  tokenFileEnv: string;
}> = {
  neoman_moleulgeol: {
    expectedChannelId: "UCOdvPLaFnvzAI-_VyIXTdOw",
    expectedChannelTitle: "너만모를껄?",
    tokenFileEnv: "YOUTUBE_PUBLIC_PUBLISHER_NEOMAN_TOKEN_FILE"
  },
  father_jobs: {
    expectedChannelId: "UC38rroV6ZRTIzqKgWr5vWrw",
    expectedChannelTitle: "father jobs",
    tokenFileEnv: "YOUTUBE_PUBLIC_PUBLISHER_FATHER_TOKEN_FILE"
  }
};

export function resolvePublisherChannel(
  channelKey: YouTubePublicPublisherChannelKey,
  env: PublisherEnvironment = process.env
): PublisherChannelRoute {
  const config = CHANNEL_CONFIG[channelKey];
  if (!config) {
    throw new Error("UNSUPPORTED_YOUTUBE_PUBLIC_PUBLISHER_CHANNEL");
  }

  return {
    channelKey,
    expectedChannelId: config.expectedChannelId,
    expectedChannelTitle: config.expectedChannelTitle,
    tokenFilePath: env[config.tokenFileEnv]?.trim() ?? ""
  };
}

export function isYouTubePublicPublisherChannelKey(value: string): value is YouTubePublicPublisherChannelKey {
  return YOUTUBE_PUBLIC_PUBLISHER_CHANNEL_KEYS.includes(value as YouTubePublicPublisherChannelKey);
}
