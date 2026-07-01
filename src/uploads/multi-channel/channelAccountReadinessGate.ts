import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";

export type V050ChannelAccountRoute = {
  channel_key: ChannelKey;
  youtube_account_alias: string;
  target_channel_id_or_handle: string;
  resolved_upload_account_alias: string;
  target_channel_configured: boolean;
  resolved_channel_id_or_handle_present: boolean;
  upload_account_matches_target: boolean;
  token_scope: "youtube.upload";
  read_only_check_required_before_v051: true;
  secret_safe: true;
  blocker: string | null;
};

export type V050ChannelAccountReadiness = {
  CHANNEL_ROUTING_READY: boolean;
  father_jobs_target_channel_configured: boolean;
  father_jobs_resolved_channel_id_or_handle_present: boolean;
  father_jobs_upload_account_matches_target: boolean;
  neoman_moleulgeol_target_channel_configured: boolean;
  neoman_moleulgeol_resolved_channel_id_or_handle_present: boolean;
  neoman_moleulgeol_upload_account_matches_target: boolean;
  lets_buy_target_channel_configured: boolean;
  lets_buy_resolved_channel_id_or_handle_present: boolean;
  lets_buy_upload_account_matches_target: boolean;
  single_oauth_three_channel_safety_pass: boolean;
  channel_routing_blocker: V050ChannelRoutingBlocker | null;
  routes: V050ChannelAccountRoute[];
  raw_token_printed: false;
  secrets_printed: false;
};

export type V050ChannelRoutingBlocker =
  | "CHANNEL_TARGET_NOT_CONFIGURED"
  | "CHANNEL_ACCOUNT_MISMATCH"
  | "SINGLE_OAUTH_TOKEN_THREE_CHANNEL_RISK";

const CHANNEL_ACCOUNT_TARGETS: Record<ChannelKey, {
  youtube_account_alias: string;
  target_channel_id_or_handle: string;
}> = {
  father_jobs: {
    youtube_account_alias: "father_jobs_youtube_account",
    target_channel_id_or_handle: "@father-jobs"
  },
  neoman_moleulgeol: {
    youtube_account_alias: "neoman_moleulgeol_youtube_account",
    target_channel_id_or_handle: "@neoman-moleulgeol"
  },
  lets_buy: {
    youtube_account_alias: "lets_buy_youtube_account",
    target_channel_id_or_handle: "@lets-buy"
  }
};

export function resolveV050ChannelAccountRoutes(): V050ChannelAccountRoute[] {
  return CHANNEL_KEYS.map((channelKey) => {
    const target = CHANNEL_ACCOUNT_TARGETS[channelKey];
    return buildRoute({
      channel_key: channelKey,
      youtube_account_alias: target.youtube_account_alias,
      target_channel_id_or_handle: target.target_channel_id_or_handle,
      resolved_upload_account_alias: target.youtube_account_alias
    });
  });
}

export function buildV050ChannelAccountReadiness(
  routes: V050ChannelAccountRoute[] = resolveV050ChannelAccountRoutes()
): V050ChannelAccountReadiness {
  const normalizedRoutes = routes.map((route) => buildRoute(route));
  const routeByChannel = Object.fromEntries(normalizedRoutes.map((route) => [route.channel_key, route])) as Record<ChannelKey, V050ChannelAccountRoute>;
  const singleOAuthSafetyPass = new Set(normalizedRoutes.map((route) => route.youtube_account_alias)).size === normalizedRoutes.length;
  const blocker = firstBlocker([
    normalizedRoutes.every((route) => route.target_channel_configured && route.resolved_channel_id_or_handle_present)
      ? null
      : "CHANNEL_TARGET_NOT_CONFIGURED",
    singleOAuthSafetyPass ? null : "SINGLE_OAUTH_TOKEN_THREE_CHANNEL_RISK",
    normalizedRoutes.every((route) => route.upload_account_matches_target && route.blocker === null)
      ? null
      : "CHANNEL_ACCOUNT_MISMATCH"
  ]);

  return {
    CHANNEL_ROUTING_READY: blocker === null,
    father_jobs_target_channel_configured: routeByChannel.father_jobs.target_channel_configured,
    father_jobs_resolved_channel_id_or_handle_present: routeByChannel.father_jobs.resolved_channel_id_or_handle_present,
    father_jobs_upload_account_matches_target: routeByChannel.father_jobs.upload_account_matches_target,
    neoman_moleulgeol_target_channel_configured: routeByChannel.neoman_moleulgeol.target_channel_configured,
    neoman_moleulgeol_resolved_channel_id_or_handle_present: routeByChannel.neoman_moleulgeol.resolved_channel_id_or_handle_present,
    neoman_moleulgeol_upload_account_matches_target: routeByChannel.neoman_moleulgeol.upload_account_matches_target,
    lets_buy_target_channel_configured: routeByChannel.lets_buy.target_channel_configured,
    lets_buy_resolved_channel_id_or_handle_present: routeByChannel.lets_buy.resolved_channel_id_or_handle_present,
    lets_buy_upload_account_matches_target: routeByChannel.lets_buy.upload_account_matches_target,
    single_oauth_three_channel_safety_pass: singleOAuthSafetyPass,
    channel_routing_blocker: blocker,
    routes: normalizedRoutes,
    raw_token_printed: false,
    secrets_printed: false
  };
}

function buildRoute(input: {
  channel_key: ChannelKey;
  youtube_account_alias: string;
  target_channel_id_or_handle: string;
  resolved_upload_account_alias?: string;
}): V050ChannelAccountRoute {
  const resolvedAlias = safeTrim(input.resolved_upload_account_alias) || input.youtube_account_alias;
  const targetHandle = safeTrim(input.target_channel_id_or_handle);
  const targetConfigured = Boolean(targetHandle);
  const accountMatches = Boolean(input.youtube_account_alias) && input.youtube_account_alias === resolvedAlias;

  return {
    channel_key: input.channel_key,
    youtube_account_alias: safeTrim(input.youtube_account_alias),
    target_channel_id_or_handle: targetHandle,
    resolved_upload_account_alias: resolvedAlias,
    target_channel_configured: targetConfigured,
    resolved_channel_id_or_handle_present: targetConfigured,
    upload_account_matches_target: accountMatches,
    token_scope: "youtube.upload",
    read_only_check_required_before_v051: true,
    secret_safe: true,
    blocker: firstBlocker([
      targetConfigured ? null : "CHANNEL_TARGET_NOT_CONFIGURED",
      accountMatches ? null : "CHANNEL_ACCOUNT_MISMATCH"
    ])
  };
}

function firstBlocker<T extends string>(values: Array<T | null>) {
  return values.find((value): value is T => Boolean(value)) ?? null;
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
