import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  buildV051ExecutionInputFromEnv
} from "../scripts/uploads/execute-v051-three-channel-public-upload";
import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  resolveV066CoupangDeeplinkAffiliateBridge
} from "../src/uploads/multi-channel/v066CoupangDeeplinkAffiliateBridge";

const AFFILIATE_ENV_KEYS = {
  father_jobs: "V051_FATHER_JOBS_AFFILIATE_URL",
  neoman_moleulgeol: "V051_NEOMAN_MOLEULGEOL_AFFILIATE_URL",
  lets_buy: "V051_LETS_BUY_AFFILIATE_URL"
} as const satisfies Record<ChannelKey, string>;

const RAW_ENV_KEYS = {
  father_jobs: "V051_FATHER_JOBS_RAW_COUPANG_URL",
  neoman_moleulgeol: "V051_NEOMAN_MOLEULGEOL_RAW_COUPANG_URL",
  lets_buy: "V051_LETS_BUY_RAW_COUPANG_URL"
} as const satisfies Record<ChannelKey, string>;

const VALID_AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v066-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v066-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v066-lets-buy"].join("/")
};

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "v066-father"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "v066-neoman"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "v066-lets-buy"].join("/")
};

const COUPANG_ENV = {
  COUPANG_ACCESS_KEY: "v066-access-key",
  COUPANG_SECRET_KEY: "v066-secret-key"
};

const FORBIDDEN_REPORT_PATTERN =
  /v066-father|v066-neoman|v066-lets-buy|v066-access-key|v066-secret-key|Authorization|signature=|HmacSHA256/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v066-"));
}

async function writeDotEnv(cwd: string, values: Record<string, string>) {
  await writeFile(
    path.join(cwd, ".env.local"),
    Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n"),
    "utf8"
  );
}

async function writeV057Assets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v057-${channelKey}-mp4`, "utf8");
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v057-${channelKey}-jpg`, "utf8");
  }
}

function envFromAffiliateUrls(urls: Record<ChannelKey, string>) {
  return Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [
    AFFILIATE_ENV_KEYS[channelKey],
    urls[channelKey]
  ])) as NodeJS.ProcessEnv;
}

function envFromRawUrls(urls: Record<ChannelKey, string>) {
  return Object.fromEntries(CHANNEL_KEYS.map((channelKey) => [
    RAW_ENV_KEYS[channelKey],
    urls[channelKey]
  ])) as NodeJS.ProcessEnv;
}

function mockDeeplinkFetch(urls: Record<ChannelKey, string>, status = 200) {
  const fetchImpl = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return {
        rCode: status >= 200 && status < 300 ? "0" : "500",
        data: CHANNEL_KEYS.map((channelKey) => ({
          originalUrl: RAW_COUPANG_URLS[channelKey],
          shortenUrl: urls[channelKey]
        }))
      };
    }
  })) as unknown as typeof fetch;
  return fetchImpl;
}

describe("v066 Coupang Deeplink affiliate URL bridge", () => {
  test("uses explicit V051 affiliate URL env values before calling Deeplink API", async () => {
    const fetchImpl = mockDeeplinkFetch(VALID_AFFILIATE_URLS);

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: envFromAffiliateUrls(VALID_AFFILIATE_URLS),
      fetchImpl
    });

    expect(result.affiliateUrls).toEqual(VALID_AFFILIATE_URLS);
    expect(result.report.affiliate_url_bridge_ready).toBe(true);
    expect(result.report.resolution_order).toEqual([
      "explicit_v051_affiliate_url_env",
      "coupang_deeplink_from_raw_coupang_url"
    ]);
    expect(result.report.deeplink_api_called).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.report.channels.every((channel) => channel.affiliate_source === "explicit_env")).toBe(true);
    expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("generates affiliate URLs through Deeplink API when explicit affiliate URLs are absent", async () => {
    const fetchImpl = mockDeeplinkFetch(VALID_AFFILIATE_URLS);

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: {
        ...COUPANG_ENV,
        ...envFromRawUrls(RAW_COUPANG_URLS)
      },
      fetchImpl
    });

    expect(result.affiliateUrls).toEqual(VALID_AFFILIATE_URLS);
    expect(result.report.affiliate_url_bridge_ready).toBe(true);
    expect(result.report.deeplink_api_called).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.report.channels.every((channel) => channel.affiliate_source === "deeplink")).toBe(true);
    expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("blocks before Deeplink API call when raw Coupang URLs are missing", async () => {
    const fetchImpl = mockDeeplinkFetch(VALID_AFFILIATE_URLS);

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: COUPANG_ENV,
      fetchImpl
    });

    expect(result.report.affiliate_url_bridge_ready).toBe(false);
    expect(result.report.bridge_blocker).toBe("BLOCKED_V066_RAW_COUPANG_URLS_MISSING");
    expect(result.report.deeplink_api_called).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("blocks before Deeplink API call when Coupang credentials are missing", async () => {
    const fetchImpl = mockDeeplinkFetch(VALID_AFFILIATE_URLS);

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: {
        ...envFromRawUrls(RAW_COUPANG_URLS),
        COUPANG_ACCESS_KEY: "",
        COUPANG_SECRET_KEY: "",
        COUPANG_PARTNERS_ACCESS_KEY: "",
        COUPANG_PARTNERS_SECRET_KEY: ""
      },
      fetchImpl
    });

    expect(result.report.affiliate_url_bridge_ready).toBe(false);
    expect(result.report.bridge_blocker).toBe("BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING");
    expect(result.report.credentials.access_key_present).toBe(false);
    expect(result.report.credentials.secret_key_present).toBe(false);
    expect(result.report.deeplink_api_called).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("blocks when Deeplink API fails", async () => {
    const fetchImpl = mockDeeplinkFetch(VALID_AFFILIATE_URLS, 500);

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: {
        ...COUPANG_ENV,
        ...envFromRawUrls(RAW_COUPANG_URLS)
      },
      fetchImpl
    });

    expect(result.report.affiliate_url_bridge_ready).toBe(false);
    expect(result.report.bridge_blocker).toBe("BLOCKED_V066_COUPANG_DEEPLINK_FAILED");
    expect(result.report.deeplink_api_called).toBe(true);
    expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("uses shortenUrl first and falls back to landingUrl when shortenUrl is absent", async () => {
    const landingUrls: Record<ChannelKey, string> = {
      father_jobs: ["https://link.coupang.com", "a", "landing-father"].join("/"),
      neoman_moleulgeol: ["https://link.coupang.com", "a", "landing-neoman"].join("/"),
      lets_buy: ["https://link.coupang.com", "a", "landing-lets-buy"].join("/")
    };
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          rCode: "0",
          data: CHANNEL_KEYS.map((channelKey) => ({
            originalUrl: RAW_COUPANG_URLS[channelKey],
            landingUrl: landingUrls[channelKey]
          }))
        };
      }
    })) as unknown as typeof fetch;

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: {
        ...COUPANG_ENV,
        ...envFromRawUrls(RAW_COUPANG_URLS)
      },
      fetchImpl
    });

    expect(result.affiliateUrls).toEqual(landingUrls);
    expect(result.report.affiliate_url_bridge_ready).toBe(true);
    expect(result.report.channels.every((channel) => channel.affiliate_source === "deeplink")).toBe(true);
    expect(JSON.stringify(result.report)).not.toMatch(/landing-father|landing-neoman|landing-lets-buy/i);
  });

  test("blocks when Deeplink result URL is not an allowed affiliate host", async () => {
    const invalidUrls: Record<ChannelKey, string> = {
      father_jobs: ["https://not-coupang.example", "a", "father"].join("/"),
      neoman_moleulgeol: ["https://not-coupang.example", "a", "neoman"].join("/"),
      lets_buy: ["https://not-coupang.example", "a", "lets-buy"].join("/")
    };
    const fetchImpl = mockDeeplinkFetch(invalidUrls);

    const result = await resolveV066CoupangDeeplinkAffiliateBridge({
      env: {
        ...COUPANG_ENV,
        ...envFromRawUrls(RAW_COUPANG_URLS)
      },
      fetchImpl
    });

    expect(result.report.affiliate_url_bridge_ready).toBe(false);
    expect(result.report.bridge_blocker).toBe("BLOCKED_V057_AFFILIATE_URLS_INVALID");
    expect(result.report.v063_affiliate_url_gate.affiliate_url_blocker).toBe("BLOCKED_V057_AFFILIATE_URLS_INVALID");
    expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
  });

  test("CLI execution input passes Deeplink-generated affiliateUrls into v051 execution input", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeDotEnv(cwd, {
        ...COUPANG_ENV,
        ...envFromRawUrls(RAW_COUPANG_URLS)
      });
      const fetchImpl = mockDeeplinkFetch(VALID_AFFILIATE_URLS);

      const executionInput = await buildV051ExecutionInputFromEnv({
        cwd,
        fetchImpl,
        env: {
          V051_EXECUTION_MODE: "mutation_enabled",
          V051_UPLOAD_ASSET_PROFILE: "v057_corrected_reupload"
        }
      });

      expect(executionInput.affiliateUrls).toEqual(VALID_AFFILIATE_URLS);
      expect(executionInput.affiliateUrlBridge.report.affiliate_url_bridge_ready).toBe(true);
      expect(executionInput.affiliateUrlGate.report.affiliate_url_gate_ready).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(executionInput.affiliateUrlBridge.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
