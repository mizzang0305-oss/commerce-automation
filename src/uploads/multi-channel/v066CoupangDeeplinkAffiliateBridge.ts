import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  requestCoupangDeeplinkAffiliateUrls,
  resolveCoupangDeeplinkEnv,
  type CoupangDeeplinkCredentialsReadiness
} from "../coupang/coupangDeeplinkClient";
import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import type { V049AffiliateUrls } from "./threeChannelUploadPreflight";
import {
  V057_AFFILIATE_URL_ENV_KEYS,
  validateV057AffiliateUrlsForExecution,
  type V057AffiliateUrlGateReport
} from "./v057AffiliateUrlInjectionGate";
import {
  resolveV057CorrectedReuploadProductSources,
  type V057ProductSourceLoaderReport
} from "./v057CorrectedReuploadProductSourceLoader";
import { V057_REUPLOAD_ASSET_PROFILE } from "./v057ReuploadAssetBinding";

export const V066_RAW_COUPANG_URL_ENV_KEYS: Record<ChannelKey, string> = {
  father_jobs: "V051_FATHER_JOBS_RAW_COUPANG_URL",
  neoman_moleulgeol: "V051_NEOMAN_MOLEULGEOL_RAW_COUPANG_URL",
  lets_buy: "V051_LETS_BUY_RAW_COUPANG_URL"
};

export type V066AffiliateBridgeBlocker =
  | "BLOCKED_V066_RAW_COUPANG_URLS_MISSING"
  | "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING"
  | "BLOCKED_V066_COUPANG_DEEPLINK_FAILED"
  | "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
  | "BLOCKED_V068_RAW_COUPANG_URL_SOURCE_INVALID"
  | "BLOCKED_V057_AFFILIATE_URLS_MISSING"
  | "BLOCKED_V057_AFFILIATE_URLS_INVALID";

export type V066AffiliateBridgeChannelEvidence = {
  channel_key: ChannelKey;
  explicit_affiliate_env_key: string;
  raw_coupang_url_env_key: string;
  affiliate_source: "explicit_env" | "deeplink" | "missing";
  source: "env" | "deeplink" | "missing";
  affiliate_present: boolean;
  affiliate_host: "link.coupang.com" | "<HOST_NOT_ALLOWED>" | "<URL_MISSING>" | "<URL_INVALID>";
  affiliate_hash_prefix: string | null;
  affiliate_length_bucket: "missing" | "1-99" | "100-199" | "200+";
  raw_coupang_url_source: "runtime_bound_v057_product_source" | "process_env" | ".env.local" | "missing" | "not_required";
  raw_coupang_url_present: boolean;
  raw_coupang_host: "www.coupang.com" | "link.coupang.com" | "coupang.com_family" | "<HOST_NOT_ALLOWED>" | "<URL_MISSING>" | "<URL_INVALID>";
  raw_coupang_hash_prefix: string | null;
  raw_coupang_length_bucket: "missing" | "1-99" | "100-199" | "200+";
};

export type V066AffiliateBridgeReport = {
  version: "v066";
  affiliate_url_bridge_ready: boolean;
  bridge_blocker: V066AffiliateBridgeBlocker | null;
  resolution_order: readonly string[];
  explicit_affiliate_env_keys: Record<ChannelKey, string>;
  raw_coupang_url_env_keys: Record<ChannelKey, string>;
  raw_coupang_url_source: "runtime_bound_v057_product_source" | "server_env" | "missing" | "mixed";
  v068_product_source: V057ProductSourceLoaderReport | null;
  deeplink_api_called: boolean;
  deeplink_api_call_allowed: boolean;
  credentials: CoupangDeeplinkCredentialsReadiness;
  channels: V066AffiliateBridgeChannelEvidence[];
  v063_affiliate_url_gate: V057AffiliateUrlGateReport;
  videos_insert_called: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  DB_write: false;
  product_assets_write: false;
  raw_coupang_urls_printed: false;
  raw_urls_printed: false;
  secrets_printed: false;
  auth_header_printed: false;
  fake_success: false;
};

export type V066AffiliateBridgeResult = {
  affiliateUrls: V049AffiliateUrls;
  report: V066AffiliateBridgeReport;
};

type ChannelValueSource = "runtime_bound_v057_product_source" | "process_env" | ".env.local" | "missing";

type ChannelValue = {
  key: string;
  value: string;
  source: ChannelValueSource;
};

export async function resolveV066CoupangDeeplinkAffiliateBridge(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  uploadAssetProfile?: string | null;
} = {}): Promise<V066AffiliateBridgeResult> {
  const cwd = input.cwd ?? process.cwd();
  const env = input.env ?? process.env;
  const fileEnv = await readDotEnvLocal(cwd);
  const credentials = resolveCoupangDeeplinkEnv({ ...fileEnv, ...env }).readiness;
  const explicitAffiliateUrls = readChannelValues(V057_AFFILIATE_URL_ENV_KEYS, env, fileEnv);
  const envRawCoupangUrls = readChannelValues(V066_RAW_COUPANG_URL_ENV_KEYS, env, fileEnv);
  const v068ProductSource = input.uploadAssetProfile === V057_REUPLOAD_ASSET_PROFILE
    ? await resolveV057CorrectedReuploadProductSources({
      cwd,
      uploadAssetProfile: input.uploadAssetProfile
    })
    : null;
  const rawCoupangUrls = mergeRuntimeAndEnvRawSources({
    envRawCoupangUrls,
    runtimeRawCoupangUrls: v068ProductSource?.rawCoupangUrls
  });
  const generatedAffiliateUrls: Partial<Record<ChannelKey, string>> = {};
  const missingAffiliateChannels = CHANNEL_KEYS.filter((channelKey) => !explicitAffiliateUrls[channelKey].value);
  let bridgeBlocker: V066AffiliateBridgeBlocker | null = null;
  let deeplinkApiCalled = false;

  if (missingAffiliateChannels.length > 0) {
    const rawMissing = missingAffiliateChannels.some((channelKey) => !rawCoupangUrls[channelKey].value);
    if (rawMissing && v068ProductSource?.report.product_source_blocker) {
      bridgeBlocker = v068ProductSource.report.product_source_blocker;
    } else if (rawMissing) {
      bridgeBlocker = "BLOCKED_V066_RAW_COUPANG_URLS_MISSING";
    } else if (!credentials.access_key_present || !credentials.secret_key_present) {
      bridgeBlocker = "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING";
    } else {
      const deeplink = await requestCoupangDeeplinkAffiliateUrls({
        rawCoupangUrls: missingAffiliateChannels.map((channelKey) => rawCoupangUrls[channelKey].value),
        env: { ...fileEnv, ...env },
        fetchImpl: input.fetchImpl
      });
      deeplinkApiCalled = deeplink.external_api_called;
      if (!deeplink.ok) {
        bridgeBlocker = deeplink.blocker;
      } else {
        missingAffiliateChannels.forEach((channelKey, index) => {
          generatedAffiliateUrls[channelKey] = deeplink.affiliateUrls[index] ?? "";
        });
      }
    }
  }

  const affiliateUrls = Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [
    channelKey,
    explicitAffiliateUrls[channelKey].value || generatedAffiliateUrls[channelKey] || ""
  ])) as V049AffiliateUrls;
  const v063Gate = validateV057AffiliateUrlsForExecution({ affiliateUrls });
  const finalBlocker = bridgeBlocker ?? v063Gate.affiliate_url_blocker;
  const report: V066AffiliateBridgeReport = {
    version: "v066",
    affiliate_url_bridge_ready: finalBlocker === null,
    bridge_blocker: finalBlocker,
    resolution_order: [
      "runtime_bound_v057_raw_coupang_url_source",
      "coupang_deeplink_from_raw_coupang_url",
      "explicit_v051_affiliate_url_env_emergency_override",
      "explicit_v051_raw_coupang_url_env_emergency_override"
    ],
    explicit_affiliate_env_keys: V057_AFFILIATE_URL_ENV_KEYS,
    raw_coupang_url_env_keys: V066_RAW_COUPANG_URL_ENV_KEYS,
    raw_coupang_url_source: summarizeRawSource(rawCoupangUrls),
    v068_product_source: v068ProductSource?.report ?? null,
    deeplink_api_called: deeplinkApiCalled,
    deeplink_api_call_allowed: missingAffiliateChannels.length > 0
      && bridgeBlocker !== "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
      && bridgeBlocker !== "BLOCKED_V066_RAW_COUPANG_URLS_MISSING"
      && bridgeBlocker !== "BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING",
    credentials,
    channels: CHANNEL_KEYS.map((channelKey) => buildChannelEvidence({
      channelKey,
      explicitValue: explicitAffiliateUrls[channelKey],
      rawValue: rawCoupangUrls[channelKey],
      affiliateUrl: affiliateUrls[channelKey] ?? "",
      generatedByDeeplink: Boolean(generatedAffiliateUrls[channelKey])
    })),
    v063_affiliate_url_gate: v063Gate,
    videos_insert_called: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    DB_write: false,
    product_assets_write: false,
    raw_coupang_urls_printed: false,
    raw_urls_printed: false,
    secrets_printed: false,
    auth_header_printed: false,
    fake_success: false
  };

  return { affiliateUrls, report };
}

async function readDotEnvLocal(cwd: string) {
  try {
    return parseEnvFile(await fs.readFile(path.join(cwd, ".env.local"), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

function parseEnvFile(text: string) {
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    values[trimmed.slice(0, separatorIndex).trim()] = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function readChannelValues(
  keys: Record<ChannelKey, string>,
  env: NodeJS.ProcessEnv,
  fileEnv: Record<string, string>
) {
  return Object.fromEntries(CHANNEL_KEYS.map((channelKey) => {
    const key = keys[channelKey];
    const processValue = safeTrim(env[key]);
    const fileValue = safeTrim(fileEnv[key]);
    return [channelKey, {
      key,
      value: processValue || fileValue,
      source: processValue ? "process_env" : fileValue ? ".env.local" : "missing"
    }];
  })) as Record<ChannelKey, ChannelValue>;
}

function mergeRuntimeAndEnvRawSources(input: {
  envRawCoupangUrls: Record<ChannelKey, ChannelValue>;
  runtimeRawCoupangUrls?: Record<ChannelKey, string>;
}) {
  return Object.fromEntries(CHANNEL_KEYS.map((channelKey) => {
    const runtimeValue = safeTrim(input.runtimeRawCoupangUrls?.[channelKey]);
    if (runtimeValue) {
      return [channelKey, {
        key: input.envRawCoupangUrls[channelKey].key,
        value: runtimeValue,
        source: "runtime_bound_v057_product_source"
      }];
    }
    return [channelKey, input.envRawCoupangUrls[channelKey]];
  })) as Record<ChannelKey, ChannelValue>;
}

function buildChannelEvidence(input: {
  channelKey: ChannelKey;
  explicitValue: ChannelValue;
  rawValue: ChannelValue;
  affiliateUrl: string;
  generatedByDeeplink: boolean;
}): V066AffiliateBridgeChannelEvidence {
  const affiliateParsed = parseHttpsUrl(input.affiliateUrl);
  const rawParsed = parseHttpsUrl(input.rawValue.value);
  const affiliateSource = input.explicitValue.value
    ? "explicit_env"
    : input.generatedByDeeplink
      ? "deeplink"
      : "missing";
  return {
    channel_key: input.channelKey,
    explicit_affiliate_env_key: input.explicitValue.key,
    raw_coupang_url_env_key: input.rawValue.key,
    affiliate_source: affiliateSource,
    source: affiliateSource === "explicit_env" ? "env" : affiliateSource,
    affiliate_present: Boolean(input.affiliateUrl),
    affiliate_host: sanitizedAffiliateHost(input.affiliateUrl, affiliateParsed),
    affiliate_hash_prefix: hashPrefix(input.affiliateUrl),
    affiliate_length_bucket: lengthBucket(input.affiliateUrl),
    raw_coupang_url_source: input.explicitValue.value && !input.rawValue.value ? "not_required" : input.rawValue.source,
    raw_coupang_url_present: Boolean(input.rawValue.value),
    raw_coupang_host: sanitizedRawHost(input.rawValue.value, rawParsed),
    raw_coupang_hash_prefix: hashPrefix(input.rawValue.value),
    raw_coupang_length_bucket: lengthBucket(input.rawValue.value)
  };
}

function summarizeRawSource(values: Record<ChannelKey, ChannelValue>) {
  const sources = CHANNEL_KEYS.map((channelKey) => values[channelKey].source);
  if (sources.every((source) => source === "runtime_bound_v057_product_source")) {
    return "runtime_bound_v057_product_source";
  }
  if (sources.every((source) => source === "missing")) return "missing";
  if (sources.every((source) => source !== "missing")) return "server_env";
  return "mixed";
}

function parseHttpsUrl(value: string) {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed : null;
  } catch {
    return null;
  }
}

function sanitizedAffiliateHost(value: string, parsed: URL | null): V066AffiliateBridgeChannelEvidence["affiliate_host"] {
  if (!value) return "<URL_MISSING>";
  if (!parsed) return "<URL_INVALID>";
  return parsed.hostname === "link.coupang.com" ? "link.coupang.com" : "<HOST_NOT_ALLOWED>";
}

function sanitizedRawHost(value: string, parsed: URL | null): V066AffiliateBridgeChannelEvidence["raw_coupang_host"] {
  if (!value) return "<URL_MISSING>";
  if (!parsed) return "<URL_INVALID>";
  if (parsed.hostname === "www.coupang.com" || parsed.hostname === "link.coupang.com") return parsed.hostname;
  if (parsed.hostname === "coupang.com" || parsed.hostname.endsWith(".coupang.com")) return "coupang.com_family";
  return "<HOST_NOT_ALLOWED>";
}

function hashPrefix(value: string) {
  return value ? crypto.createHash("sha256").update(value).digest("hex").slice(0, 10) : null;
}

function lengthBucket(value: string): V066AffiliateBridgeChannelEvidence["affiliate_length_bucket"] {
  if (!value) return "missing";
  if (value.length < 100) return "1-99";
  if (value.length < 200) return "100-199";
  return "200+";
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
