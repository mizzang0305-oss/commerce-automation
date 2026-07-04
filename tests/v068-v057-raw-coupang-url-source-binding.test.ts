import crypto from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { buildV051ExecutionInputFromEnv } from "../scripts/uploads/execute-v051-three-channel-public-upload";
import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import {
  resolveV057CorrectedReuploadProductSources
} from "../src/uploads/multi-channel/v057CorrectedReuploadProductSourceLoader";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  resolveV066CoupangDeeplinkAffiliateBridge
} from "../src/uploads/multi-channel/v066CoupangDeeplinkAffiliateBridge";

const PRODUCT_LABELS: Record<ChannelKey, string> = {
  father_jobs: "차량용 컵홀더 정리함",
  neoman_moleulgeol: "접이식 빨래건조대",
  lets_buy: "특가 케이블 정리함"
};

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "868000001"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "868000002"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "868000003"].join("/")
};

const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v068-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v068-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v068-lets-buy"].join("/")
};

const COUPANG_ENV = {
  COUPANG_ACCESS_KEY: "v068-access-key",
  COUPANG_SECRET_KEY: "v068-secret-key"
};

const FORBIDDEN_REPORT_PATTERN =
  /868000001|868000002|868000003|v068-father|v068-neoman|v068-lets-buy|v068-access-key|v068-secret-key|Authorization|signature=|HmacSHA256/i;

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v068-"));
}

async function writeProductSources(cwd: string, overrides: Partial<Record<ChannelKey, Record<string, unknown>>> = {}) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    const rawCoupangUrl = RAW_COUPANG_URLS[channelKey];
    await writeFile(
      path.join(channelDir, "product-source-v057.json"),
      JSON.stringify({
        channelKey,
        assetProfile: V057_REUPLOAD_ASSET_PROFILE,
        productSourceKind: "v057_review_package_metadata",
        rawCoupangUrl,
        productName: PRODUCT_LABELS[channelKey],
        sourceEvidenceHash: crypto.createHash("sha256").update(`${channelKey}:${rawCoupangUrl}`).digest("hex"),
        boundAt: "2026-07-04T00:00:00.000Z",
        ...overrides[channelKey]
      }, null, 2),
      "utf8"
    );
  }
}

function mockDeeplinkFetch(status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return {
        rCode: status >= 200 && status < 300 ? "0" : "500",
        data: CHANNEL_KEYS.map((channelKey) => ({
          originalUrl: RAW_COUPANG_URLS[channelKey],
          shortenUrl: AFFILIATE_URLS[channelKey]
        }))
      };
    }
  })) as unknown as typeof fetch;
}

describe("v068 v057 raw Coupang URL source binding", () => {
  test("loads authoritative v057 product-source metadata without printing raw Coupang URLs", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd);

      const result = await resolveV057CorrectedReuploadProductSources({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      });

      expect(result.rawCoupangUrls).toEqual(RAW_COUPANG_URLS);
      expect(result.report.product_source_ready).toBe(true);
      expect(result.report.product_source_blocker).toBeNull();
      expect(result.report.channels.every((channel) => channel.raw_coupang_url_present)).toBe(true);
      expect(result.report.channels.every((channel) => channel.host_label === "www.coupang.com")).toBe(true);
      expect(result.report.raw_coupang_urls_printed).toBe(false);
      expect(result.report.raw_urls_printed).toBe(false);
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runtime-bound raw source lets V066 Deeplink bridge pass without V051 affiliate or raw URL env", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd);
      const fetchImpl = mockDeeplinkFetch();

      const result = await resolveV066CoupangDeeplinkAffiliateBridge({
        cwd,
        env: {
          ...COUPANG_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl
      });

      expect(result.affiliateUrls).toEqual(AFFILIATE_URLS);
      expect(result.report.affiliate_url_bridge_ready).toBe(true);
      expect(result.report.bridge_blocker).toBeNull();
      expect(result.report.raw_coupang_url_source).toBe("runtime_bound_v057_product_source");
      expect(result.report.channels.every((channel) => channel.raw_coupang_url_source === "runtime_bound_v057_product_source")).toBe(true);
      expect(result.report.channels.every((channel) => channel.affiliate_source === "deeplink")).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("CLI passes the selected v057 asset profile into V066 runtime source resolution", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd);
      const fetchImpl = mockDeeplinkFetch();

      const executionInput = await buildV051ExecutionInputFromEnv({
        cwd,
        env: {
          ...COUPANG_ENV,
          V051_EXECUTION_MODE: "mutation_enabled",
          V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE
        },
        fetchImpl
      });

      expect(executionInput.affiliateUrls).toEqual(AFFILIATE_URLS);
      expect(executionInput.affiliateUrlBridge.report.raw_coupang_url_source).toBe("runtime_bound_v057_product_source");
      expect(executionInput.affiliateUrlBridge.report.affiliate_url_bridge_ready).toBe(true);
      expect(executionInput.affiliateUrlGate.report.affiliate_url_gate_ready).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(executionInput.affiliateUrlBridge.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("missing authoritative source blocks before Deeplink API calls", async () => {
    const cwd = await makeCwd();
    try {
      const fetchImpl = mockDeeplinkFetch();

      const result = await resolveV066CoupangDeeplinkAffiliateBridge({
        cwd,
        env: {
          ...COUPANG_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl
      });

      expect(result.report.affiliate_url_bridge_ready).toBe(false);
      expect(result.report.bridge_blocker).toBe("BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING");
      expect(result.report.deeplink_api_called).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("test-only fixture source is not accepted as runtime-bound source", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd, {
        father_jobs: { productSourceKind: "test_fixture" }
      });

      const result = await resolveV057CorrectedReuploadProductSources({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      });

      expect(result.report.product_source_ready).toBe(false);
      expect(result.report.product_source_blocker).toBe("BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING");
      expect(result.rawCoupangUrls.father_jobs).toBe("");
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("placeholder or example URLs are blocked before Deeplink API calls", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd, {
        lets_buy: { rawCoupangUrl: "https://example.com/product/placeholder" }
      });
      const fetchImpl = mockDeeplinkFetch();

      const result = await resolveV066CoupangDeeplinkAffiliateBridge({
        cwd,
        env: {
          ...COUPANG_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl
      });

      expect(result.report.affiliate_url_bridge_ready).toBe(false);
      expect(result.report.bridge_blocker).toBe("BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING");
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("channelKey or assetProfile mismatch blocks runtime source binding", async () => {
    const channelMismatch = await makeCwd();
    const profileMismatch = await makeCwd();
    try {
      await writeProductSources(channelMismatch, {
        father_jobs: { channelKey: "lets_buy" }
      });
      await writeProductSources(profileMismatch, {
        neoman_moleulgeol: { assetProfile: "v048_default" }
      });

      await expect(resolveV057CorrectedReuploadProductSources({
        cwd: channelMismatch,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        report: {
          product_source_ready: false,
          product_source_blocker: "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
        }
      });
      await expect(resolveV057CorrectedReuploadProductSources({
        cwd: profileMismatch,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      })).resolves.toMatchObject({
        report: {
          product_source_ready: false,
          product_source_blocker: "BLOCKED_V068_AUTHORITATIVE_RAW_COUPANG_URL_SOURCE_MISSING"
        }
      });
    } finally {
      await rm(channelMismatch, { recursive: true, force: true });
      await rm(profileMismatch, { recursive: true, force: true });
    }
  });

  test("runtime raw source still blocks when Coupang Deeplink credentials are missing", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd);
      const fetchImpl = mockDeeplinkFetch();

      const result = await resolveV066CoupangDeeplinkAffiliateBridge({
        cwd,
        env: {
          COUPANG_ACCESS_KEY: "",
          COUPANG_SECRET_KEY: ""
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl
      });

      expect(result.report.affiliate_url_bridge_ready).toBe(false);
      expect(result.report.bridge_blocker).toBe("BLOCKED_V066_COUPANG_API_CREDENTIALS_MISSING");
      expect(result.report.deeplink_api_called).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("runtime raw source reports Deeplink API failure without serializing URLs", async () => {
    const cwd = await makeCwd();
    try {
      await writeProductSources(cwd);
      const fetchImpl = mockDeeplinkFetch(500);

      const result = await resolveV066CoupangDeeplinkAffiliateBridge({
        cwd,
        env: {
          ...COUPANG_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl
      });

      expect(result.report.affiliate_url_bridge_ready).toBe(false);
      expect(result.report.bridge_blocker).toBe("BLOCKED_V066_COUPANG_DEEPLINK_FAILED");
      expect(result.report.deeplink_api_called).toBe(true);
      expect(JSON.stringify(result.report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
