import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { CHANNEL_KEYS, type ChannelKey } from "./channelProfiles";
import type { V049AffiliateUrls } from "./threeChannelUploadPreflight";
import type { V051MutationBlocker } from "./v051MutationSafetyGate";

export const V057_AFFILIATE_URL_ENV_KEYS: Record<ChannelKey, string> = {
  father_jobs: "V051_FATHER_JOBS_AFFILIATE_URL",
  neoman_moleulgeol: "V051_NEOMAN_MOLEULGEOL_AFFILIATE_URL",
  lets_buy: "V051_LETS_BUY_AFFILIATE_URL"
};

const ALLOWED_COUPANG_AFFILIATE_HOSTS = new Set(["link.coupang.com"]);

export type V057AffiliateUrlEvidence = {
  channel_key: ChannelKey;
  env_key: string;
  source: "process_env" | ".env.local" | "missing";
  present: boolean;
  https_url: boolean;
  host_allowed: boolean;
  host: "link.coupang.com" | "<HOST_NOT_ALLOWED>" | "<URL_MISSING>" | "<URL_INVALID>";
  length_bucket: "missing" | "1-99" | "100-199" | "200+";
  hash_prefix: string | null;
};

export type V057AffiliateUrlGateReport = {
  version: "v063";
  affiliate_url_gate_required: true;
  affiliate_url_gate_ready: boolean;
  affiliate_url_blocker:
    | Extract<V051MutationBlocker, "BLOCKED_V057_AFFILIATE_URLS_MISSING" | "BLOCKED_V057_AFFILIATE_URLS_INVALID">
    | null;
  env_keys: Record<ChannelKey, string>;
  allowed_hosts: readonly ["link.coupang.com"];
  channels: V057AffiliateUrlEvidence[];
  raw_urls_printed: false;
  secrets_printed: false;
};

export type V057AffiliateUrlLoadResult = {
  affiliateUrls: V049AffiliateUrls;
  report: V057AffiliateUrlGateReport;
};

export async function loadV057AffiliateUrlsForExecution(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  strictCoupangHost?: boolean;
} = {}): Promise<V057AffiliateUrlLoadResult> {
  const cwd = input.cwd ?? process.cwd();
  const processEnv = input.env ?? process.env;
  const fileEnv = await readDotEnvLocal(cwd);
  const affiliateUrls = Object.fromEntries(CHANNEL_KEYS.map((channelKey) => {
    const key = V057_AFFILIATE_URL_ENV_KEYS[channelKey];
    const value = safeTrim(processEnv[key]) || safeTrim(fileEnv[key]);
    return [channelKey, value];
  })) as Record<ChannelKey, string>;

  return {
    affiliateUrls,
    report: validateV057AffiliateUrlsForExecution({
      affiliateUrls,
      env: processEnv,
      fileEnv,
      strictCoupangHost: input.strictCoupangHost ?? true
    })
  };
}

export function validateV057AffiliateUrlsForExecution(input: {
  affiliateUrls?: V049AffiliateUrls;
  env?: NodeJS.ProcessEnv;
  fileEnv?: Record<string, string>;
  strictCoupangHost?: boolean;
}): V057AffiliateUrlGateReport {
  const strictCoupangHost = input.strictCoupangHost ?? true;
  const channels = CHANNEL_KEYS.map((channelKey) => {
    const key = V057_AFFILIATE_URL_ENV_KEYS[channelKey];
    const rawValue = safeTrim(input.affiliateUrls?.[channelKey]);
    const parsed = parseHttpsUrl(rawValue);
    const hostAllowed = Boolean(parsed && (!strictCoupangHost || ALLOWED_COUPANG_AFFILIATE_HOSTS.has(parsed.hostname)));
    return {
      channel_key: channelKey,
      env_key: key,
      source: resolveSource(key, input.env, input.fileEnv, rawValue),
      present: Boolean(rawValue),
      https_url: Boolean(parsed),
      host_allowed: hostAllowed,
      host: sanitizedHost(rawValue, parsed, hostAllowed),
      length_bucket: lengthBucket(rawValue),
      hash_prefix: rawValue ? crypto.createHash("sha256").update(rawValue).digest("hex").slice(0, 10) : null
    };
  });
  const missing = channels.some((channel) => !channel.present);
  const invalid = channels.some((channel) => channel.present && (!channel.https_url || !channel.host_allowed));
  const blocker = missing
    ? "BLOCKED_V057_AFFILIATE_URLS_MISSING"
    : invalid
      ? "BLOCKED_V057_AFFILIATE_URLS_INVALID"
      : null;

  return {
    version: "v063",
    affiliate_url_gate_required: true,
    affiliate_url_gate_ready: blocker === null,
    affiliate_url_blocker: blocker,
    env_keys: V057_AFFILIATE_URL_ENV_KEYS,
    allowed_hosts: ["link.coupang.com"],
    channels,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

async function readDotEnvLocal(cwd: string) {
  const envPath = path.join(cwd, ".env.local");
  try {
    return parseEnvFile(await fs.readFile(envPath, "utf8"));
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
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    values[key] = value;
  }
  return values;
}

function resolveSource(
  key: string,
  env: NodeJS.ProcessEnv | undefined,
  fileEnv: Record<string, string> | undefined,
  rawValue: string
): V057AffiliateUrlEvidence["source"] {
  if (!rawValue) return "missing";
  if (safeTrim(env?.[key])) return "process_env";
  if (safeTrim(fileEnv?.[key])) return ".env.local";
  return "missing";
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseHttpsUrl(value: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function sanitizedHost(
  rawValue: string,
  parsed: URL | null,
  hostAllowed: boolean
): V057AffiliateUrlEvidence["host"] {
  if (!rawValue) return "<URL_MISSING>";
  if (!parsed) return "<URL_INVALID>";
  return hostAllowed ? "link.coupang.com" : "<HOST_NOT_ALLOWED>";
}

function lengthBucket(value: string): V057AffiliateUrlEvidence["length_bucket"] {
  if (!value) return "missing";
  if (value.length < 100) return "1-99";
  if (value.length < 200) return "100-199";
  return "200+";
}
