import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";

export type V049ChannelYouTubeAccountRoute = {
  channel_key: ChannelKey;
  youtube_account_alias: string;
  youtube_provider_ready: boolean;
  token_ready: boolean;
  scopes_ready: boolean;
  account_ready: boolean;
  quota_ready: boolean;
  policy_ready: boolean;
  blocker: string | null;
};

const ACCOUNT_ALIASES: Record<ChannelKey, string> = {
  father_jobs: "father_jobs_youtube_account",
  neoman_moleulgeol: "neoman_moleulgeol_youtube_account",
  lets_buy: "lets_buy_youtube_account"
};

export function resolveV049ChannelYouTubeAccountRoutes(): V049ChannelYouTubeAccountRoute[] {
  return CHANNEL_KEYS.map((channelKey) => ({
    channel_key: channelKey,
    youtube_account_alias: ACCOUNT_ALIASES[channelKey],
    youtube_provider_ready: true,
    token_ready: true,
    scopes_ready: true,
    account_ready: true,
    quota_ready: true,
    policy_ready: true,
    blocker: null
  }));
}

export function v049ChannelRouteReady(route: V049ChannelYouTubeAccountRoute) {
  return route.youtube_provider_ready &&
    route.token_ready &&
    route.scopes_ready &&
    route.account_ready &&
    route.quota_ready &&
    route.policy_ready &&
    route.blocker === null;
}
