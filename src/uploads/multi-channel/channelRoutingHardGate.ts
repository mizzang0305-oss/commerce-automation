import type { ChannelKey } from "./channelProfiles";
import type { V050ChannelAccountRoute } from "./channelAccountReadinessGate";
import type { AuthenticatedChannelProbeResult } from "./runtimeAuthenticatedChannelProbe";

export type V055ChannelRoutingHardGateBlocker =
  | "BLOCKED_RUNTIME_CHANNEL_ACCOUNT_MISMATCH"
  | "BLOCKED_DUPLICATE_OAUTH_ALIAS_FOR_MULTIPLE_CHANNELS"
  | "BLOCKED_AUTHENTICATED_CHANNEL_PROBE_MISSING";

export type V055ChannelRoutingHardGate = {
  routing_ready: boolean;
  blocker: V055ChannelRoutingHardGateBlocker | null;
  authenticated_channel_probe_added: true;
  target_channel_id_match_required: true;
  duplicate_oauth_alias_block_added: true;
  one_channel_false_positive_fixed: boolean;
  father_jobs_runtime_upload_account_matches_target: boolean;
  neoman_moleulgeol_runtime_upload_account_matches_target: boolean;
  lets_buy_runtime_upload_account_matches_target: boolean;
  raw_token_printed: false;
  secrets_printed: false;
};

const CHANNEL_ORDER: ChannelKey[] = ["father_jobs", "neoman_moleulgeol", "lets_buy"];

export function evaluateV055ChannelRoutingHardGate(input: {
  routes: V050ChannelAccountRoute[];
  targetChannelIds: Partial<Record<ChannelKey, string>>;
  probes: Partial<Record<ChannelKey, AuthenticatedChannelProbeResult>>;
}): V055ChannelRoutingHardGate {
  const routeByChannel = Object.fromEntries(input.routes.map((route) => [route.channel_key, route])) as Partial<Record<ChannelKey, V050ChannelAccountRoute>>;
  const hasMissingProbe = CHANNEL_ORDER.some((channelKey) => input.probes[channelKey]?.ok !== true);
  const duplicateAliasBlocker = hasDuplicateResolvedAlias(input.routes)
    ? "BLOCKED_DUPLICATE_OAUTH_ALIAS_FOR_MULTIPLE_CHANNELS"
    : null;
  const channelMatches = Object.fromEntries(CHANNEL_ORDER.map((channelKey) => [
    channelKey,
    matchesTarget({
      route: routeByChannel[channelKey],
      targetChannelId: input.targetChannelIds[channelKey],
      probe: input.probes[channelKey]
    })
  ])) as Record<ChannelKey, boolean>;
  const mismatchBlocker = CHANNEL_ORDER.every((channelKey) => channelMatches[channelKey])
    ? null
    : "BLOCKED_RUNTIME_CHANNEL_ACCOUNT_MISMATCH";
  const blocker = hasMissingProbe
    ? "BLOCKED_AUTHENTICATED_CHANNEL_PROBE_MISSING"
    : duplicateAliasBlocker ?? mismatchBlocker;

  return {
    routing_ready: blocker === null,
    blocker,
    authenticated_channel_probe_added: true,
    target_channel_id_match_required: true,
    duplicate_oauth_alias_block_added: true,
    one_channel_false_positive_fixed: blocker === null,
    father_jobs_runtime_upload_account_matches_target: channelMatches.father_jobs,
    neoman_moleulgeol_runtime_upload_account_matches_target: channelMatches.neoman_moleulgeol,
    lets_buy_runtime_upload_account_matches_target: channelMatches.lets_buy,
    raw_token_printed: false,
    secrets_printed: false
  };
}

function hasDuplicateResolvedAlias(routes: V050ChannelAccountRoute[]) {
  const aliases = routes.map((route) => route.resolved_upload_account_alias.trim()).filter(Boolean);
  return new Set(aliases).size !== aliases.length;
}

function matchesTarget(input: {
  route?: V050ChannelAccountRoute;
  targetChannelId?: string;
  probe?: AuthenticatedChannelProbeResult;
}) {
  if (!input.route || !input.probe?.ok) return false;
  const targetChannelId = input.targetChannelId?.trim() || "";
  return Boolean(targetChannelId) &&
    input.route.upload_account_matches_target &&
    input.route.resolved_upload_account_alias === input.probe.upload_account_alias &&
    input.probe.authenticated_channel_id === targetChannelId;
}
