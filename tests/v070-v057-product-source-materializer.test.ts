import crypto from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { CHANNEL_KEYS, type ChannelKey } from "../src/uploads/multi-channel/channelProfiles";
import { resolveV057CorrectedReuploadProductSources } from "../src/uploads/multi-channel/v057CorrectedReuploadProductSourceLoader";
import { V057_REUPLOAD_ASSET_PROFILE } from "../src/uploads/multi-channel/v057ReuploadAssetBinding";
import {
  materializeV057ProductSourceMetadata,
  buildV070ProductSourceMaterializerCliInput
} from "../src/uploads/multi-channel/v057ProductSourceMaterializer";
import { buildV069UploadPackageReadiness } from "../src/uploads/multi-channel/v069UploadPackageReadiness";

const PRODUCT_LABELS: Record<ChannelKey, string> = {
  father_jobs: "차량용 컵홀더 정리함",
  neoman_moleulgeol: "접이식 빨래건조대",
  lets_buy: "특가 케이블 정리함"
};

const RAW_COUPANG_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://www.coupang.com", "vp", "products", "870000001"].join("/"),
  neoman_moleulgeol: ["https://www.coupang.com", "vp", "products", "870000002"].join("/"),
  lets_buy: ["https://www.coupang.com", "vp", "products", "870000003"].join("/")
};

const AFFILIATE_URLS: Record<ChannelKey, string> = {
  father_jobs: ["https://link.coupang.com", "a", "v070-father"].join("/"),
  neoman_moleulgeol: ["https://link.coupang.com", "a", "v070-neoman"].join("/"),
  lets_buy: ["https://link.coupang.com", "a", "v070-lets-buy"].join("/")
};

const TARGET_CHANNEL_ENV = {
  YOUTUBE_FATHER_JOBS_CHANNEL_ID: `UC${"D".repeat(22)}`,
  YOUTUBE_NEOMAN_MOLEULGEOL_CHANNEL_ID: `UC${"E".repeat(22)}`,
  YOUTUBE_LETS_BUY_CHANNEL_ID: `UC${"F".repeat(22)}`
};

const COUPANG_ENV = {
  COUPANG_ACCESS_KEY: "v070-access",
  COUPANG_SECRET_KEY: "v070-secret"
};

const FORBIDDEN_REPORT_PATTERN = new RegExp([
  "870000001",
  "870000002",
  "870000003",
  "v070-father",
  "v070-neoman",
  "v070-lets-buy",
  "v070-access",
  "v070-secret",
  ...Object.values(TARGET_CHANNEL_ENV),
  "Authorization",
  "HmacSHA256"
].map(escapeRegExp).join("|"), "i");

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v070-"));
}

async function writeQueue(cwd: string, rows: Array<Record<string, unknown>>) {
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(path.join(cwd, "data", "queue.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

async function writeGeneratedContents(cwd: string, rows: Array<Record<string, unknown>>) {
  await mkdir(path.join(cwd, "data"), { recursive: true });
  await writeFile(path.join(cwd, "data", "generated_contents.json"), `${JSON.stringify(rows, null, 2)}\n`, "utf8");
}

async function writeV057Assets(cwd: string) {
  for (const channelKey of CHANNEL_KEYS) {
    const channelDir = path.join(cwd, "commerce-assets", "review", "v057", channelKey);
    await mkdir(channelDir, { recursive: true });
    await writeFile(path.join(channelDir, "corrected-preview-v057.mp4"), `fake-v070-${channelKey}-mp4`, "utf8");
    await writeFile(path.join(channelDir, "first-frame-v057.jpg"), `fake-v070-${channelKey}-jpg`, "utf8");
  }
}

function queueRows(overrides: Partial<Record<ChannelKey, Record<string, unknown>>> = {}) {
  return CHANNEL_KEYS.map((channelKey, index) => ({
    id: `queue-v070-${channelKey}`,
    product_name: `${PRODUCT_LABELS[channelKey]} 자동 소스`,
    raw_coupang_url: RAW_COUPANG_URLS[channelKey],
    selected_affiliate_url: AFFILIATE_URLS[channelKey],
    queue_rank: index + 1,
    updated_at: "2026-07-04T00:00:00.000Z",
    ...overrides[channelKey]
  }));
}

function mockDeeplinkFetch() {
  return (async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        rCode: "0",
        data: CHANNEL_KEYS.map((channelKey) => ({
          originalUrl: RAW_COUPANG_URLS[channelKey],
          shortenUrl: AFFILIATE_URLS[channelKey]
        }))
      };
    }
  })) as unknown as typeof fetch;
}

describe("v070 v057 product source materializer", () => {
  test("materializes authoritative queue product sources into v057 runtime metadata without raw URL leakage", async () => {
    const cwd = await makeCwd();
    try {
      await writeQueue(cwd, queueRows());

      const report = await materializeV057ProductSourceMetadata({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });

      expect(report.FINAL_STATUS).toBe("SUCCESS_V070_V057_PRODUCT_SOURCE_MATERIALIZED_NO_UPLOAD");
      expect(report.product_source_materialized).toBe(true);
      expect(report.blocker).toBeNull();
      expect(report.channels.every((channel) => channel.source_kind === "product_queue_item")).toBe(true);
      expect(report.channels.every((channel) => channel.materialized)).toBe(true);
      expect(report.channels.every((channel) => channel.runtime_source_approved === true)).toBe(true);
      expect(report.channels.every((channel) => channel.raw_urls_printed === false)).toBe(true);
      expect(report.manual_affiliate_url_input_required).toBe(false);
      expect(report.manual_raw_coupang_url_input_required).toBe(false);
      expect(report.videos_insert_called).toBe(false);
      expect(report.comment_create_update_delete_called).toBe(false);
      expect(report.R2_upload).toBe(false);
      expect(report.DB_write).toBe(false);
      expect(report.product_assets_write).toBe(false);
      expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);

      for (const channelKey of CHANNEL_KEYS) {
        const materializedPath = path.join(cwd, "commerce-assets", "review", "v057", channelKey, "product-source-v057.json");
        await expect(stat(materializedPath)).resolves.toMatchObject({ isFile: expect.any(Function) });
        const payload = JSON.parse(await readFile(materializedPath, "utf8")) as Record<string, unknown>;
        expect(payload).toMatchObject({
          channelKey,
          assetProfile: V057_REUPLOAD_ASSET_PROFILE,
          productSourceKind: "product_queue_item",
          runtimeSourceApproved: true
        });
        expect(typeof payload.runtimeSourceApproved).toBe("boolean");
        expect(payload.sourceEvidenceHash).toBe(
          crypto.createHash("sha256").update(`${channelKey}:${RAW_COUPANG_URLS[channelKey]}`).digest("hex")
        );
      }

      const loader = await resolveV057CorrectedReuploadProductSources({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
      });
      expect(loader.report.product_source_ready).toBe(true);
      expect(loader.report.channels.every((channel) => channel.raw_urls_printed === false)).toBe(true);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("uses source priority and prefers product queue over generated content", async () => {
    const cwd = await makeCwd();
    try {
      await writeQueue(cwd, queueRows());
      await writeGeneratedContents(cwd, CHANNEL_KEYS.map((channelKey) => ({
        product_queue_id: `generated-v070-${channelKey}`,
        productName: PRODUCT_LABELS[channelKey],
        rawCoupangUrl: ["https://www.coupang.com", "vp", "products", `generated-${channelKey}`].join("/"),
        updatedAt: "2026-07-04T00:00:00.000Z"
      })));

      const report = await materializeV057ProductSourceMetadata({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });

      expect(report.FINAL_STATUS).toBe("SUCCESS_V070_V057_PRODUCT_SOURCE_MATERIALIZED_NO_UPLOAD");
      expect(report.channels.every((channel) => channel.source_kind === "product_queue_item")).toBe(true);
      expect(JSON.stringify(report)).not.toMatch(/generated-father|generated-neoman|generated-lets/i);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when authoritative sources are absent and does not request manual URL input", async () => {
    const cwd = await makeCwd();
    try {
      await writeQueue(cwd, []);

      const report = await materializeV057ProductSourceMetadata({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });

      expect(report.FINAL_STATUS).toBe("BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND");
      expect(report.blocker).toBe("BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND");
      expect(report.product_source_materialized).toBe(false);
      expect(report.manual_affiliate_url_input_required).toBe(false);
      expect(report.manual_raw_coupang_url_input_required).toBe(false);
      expect(report.channels.every((channel) => channel.materialized === false)).toBe(true);
      expect(report.videos_insert_called).toBe(false);
      expect(report.comment_create_update_delete_called).toBe(false);
      expect(report.raw_urls_printed).toBe(false);
      expect(report.secrets_printed).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("rejects code fixtures unless runtimeSourceApproved is boolean true", async () => {
    const rejected = await makeCwd();
    const accepted = await makeCwd();
    try {
      for (const cwd of [rejected, accepted]) {
        await mkdir(path.join(cwd, "commerce-assets", "review", "v057", "father_jobs"), { recursive: true });
      }
      await writeFile(path.join(rejected, "commerce-assets", "review", "v057", "father_jobs", "code-fixture-product-source-v057.json"), JSON.stringify({
        channelKey: "father_jobs",
        assetProfile: V057_REUPLOAD_ASSET_PROFILE,
        productSourceKind: "code_fixture_promoted",
        rawCoupangUrl: RAW_COUPANG_URLS.father_jobs,
        productName: PRODUCT_LABELS.father_jobs,
        runtimeSourceApproved: "true"
      }), "utf8");
      await writeFile(path.join(accepted, "commerce-assets", "review", "v057", "father_jobs", "code-fixture-product-source-v057.json"), JSON.stringify({
        channelKey: "father_jobs",
        assetProfile: V057_REUPLOAD_ASSET_PROFILE,
        productSourceKind: "code_fixture_promoted",
        rawCoupangUrl: RAW_COUPANG_URLS.father_jobs,
        productName: PRODUCT_LABELS.father_jobs,
        runtimeSourceApproved: true
      }), "utf8");

      const rejectedReport = await materializeV057ProductSourceMetadata({
        cwd: rejected,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });
      expect(rejectedReport.channels.find((channel) => channel.channel_key === "father_jobs")).toMatchObject({
        source_kind: "code_fixture_promoted",
        runtime_source_approved: false,
        materialized: false
      });
      expect(rejectedReport.blocker).toBe("BLOCKED_V070_AUTHORITATIVE_PRODUCT_SOURCE_NOT_FOUND");

      await writeQueue(accepted, queueRows({
        father_jobs: { product_name: "unrelated", raw_coupang_url: "" }
      }).filter((row) => row.id !== "queue-v070-father_jobs"));
      const acceptedReport = await materializeV057ProductSourceMetadata({
        cwd: accepted,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });
      expect(acceptedReport.channels.find((channel) => channel.channel_key === "father_jobs")).toMatchObject({
        source_kind: "code_fixture_promoted",
        runtime_source_approved: true,
        materialized: true
      });
    } finally {
      await rm(rejected, { recursive: true, force: true });
      await rm(accepted, { recursive: true, force: true });
    }
  });

  test("materialized metadata clears the v069 product source blocker before fresh approval", async () => {
    const cwd = await makeCwd();
    try {
      await writeV057Assets(cwd);
      await writeQueue(cwd, queueRows());

      await materializeV057ProductSourceMetadata({
        cwd,
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        now: "2026-07-04T00:00:00.000Z"
      });
      const readiness = await buildV069UploadPackageReadiness({
        cwd,
        env: {
          ...COUPANG_ENV,
          ...TARGET_CHANNEL_ENV
        },
        uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE,
        fetchImpl: mockDeeplinkFetch()
      });

      expect(readiness.product_source.raw_coupang_url_source_bound).toBe(true);
      expect(readiness.blocker).toBe("V057_CORRECTED_REUPLOAD_APPROVAL_MISSING");
      expect(readiness.packages.every((item) => item.productSource.present)).toBe(true);
      expect(readiness.videos_insert_called).toBe(false);
      expect(readiness.comment_create_update_delete_called).toBe(false);
      expect(JSON.stringify(readiness)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("CLI input keeps v057 profile explicit and never enables upload", () => {
    const input = buildV070ProductSourceMaterializerCliInput({
      cwd: "C:/tmp/repo",
      env: {
        V051_UPLOAD_ASSET_PROFILE: V057_REUPLOAD_ASSET_PROFILE
      }
    });

    expect(input).toEqual({
      cwd: "C:/tmp/repo",
      uploadAssetProfile: V057_REUPLOAD_ASSET_PROFILE
    });
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
