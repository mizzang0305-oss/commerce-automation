import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import {
  resolveV088CoupangProductSource
} from "../src/uploads/youtube/v088CoupangProductSourceResolver";

const PRODUCT_NAME = "\uCC28\uB7C9\uC6A9 \uCEF5\uD640\uB354 \uC815\uB9AC\uD568";
const RAW_COUPANG_URL = ["https://www.coupang.com", "vp", "products", "v088-product"].join("/");
const AFFILIATE_URL = ["https://link.coupang.com", "a", "v088-affiliate"].join("/");
const FORBIDDEN_PATTERN = new RegExp([
  RAW_COUPANG_URL,
  AFFILIATE_URL,
  "access-key-v088",
  "secret-key-v088",
  "CEA algorithm",
  "signature=",
  "Bearer "
].map(escapeRegExp).join("|"), "i");

describe("v088 Coupang product source resolver", () => {
  test("binds raw Coupang and affiliate URLs into the local manifest with sanitized report only", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({
          searchPayload: {
            data: {
              productData: [
                {
                  productName: PRODUCT_NAME,
                  productUrl: RAW_COUPANG_URL
                }
              ]
            }
          },
          deeplinkPayload: {
            data: [
              {
                shortenUrl: AFFILIATE_URL
              }
            ]
          }
        })
      });

      expect(result.status).toBe("bound");
      expect(result.blockers).toEqual([]);
      expect(result.productSearchApiCalled).toBe(true);
      expect(result.deeplinkApiCalled).toBe(true);
      expect(result.rawCoupangUrlPresent).toBe(true);
      expect(result.affiliateUrlPresent).toBe(true);
      expect(result.manifestChannelMatchesSelected).toBe(true);
      expect(result.manifestTargetChannelMatchesSelected).toBe(true);
      expect(result.localManifestWriteAllowed).toBe(true);
      expect(result.localManifestWritten).toBe(true);
      expect(result.v084ExecuteCalled).toBe(false);
      expect(result.videosInsertCalled).toBe(false);
      expect(result.commentThreadsInsertCalled).toBe(false);
      expect(result.rawUrlsPrinted).toBe(false);
      expect(result.rawManifestPathPrinted).toBe(false);
      expect(result.secretsPrinted).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
      expect(JSON.stringify(result)).not.toContain(manifestPath);

      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      expect(manifest.rawCoupangUrl).toBe(RAW_COUPANG_URL);
      expect(manifest.selectedAffiliateUrl).toBe(AFFILIATE_URL);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks before API calls when Coupang credentials are missing", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: {
          V088_PRODUCT_SOURCE_MANIFEST_PATH: manifestPath,
          COUPANG_PARTNERS_PROVIDER_ENABLED: "true"
        },
        fetchImpl: mockFetch({})
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_COUPANG_ACCESS_KEY_MISSING");
      expect(result.productSearchApiCalled).toBe(false);
      expect(result.deeplinkApiCalled).toBe(false);
      expect(result.localManifestWriteAllowed).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("uses live Partners productUrl as affiliate evidence and derives raw product URL from pageKey", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      const partnersProductUrl = [
        "https://link.coupang.com",
        "re",
        "AFFSDP?lptag=AF0000000&pageKey=111222333&itemId=444555&vendorItemId=666777"
      ].join("/");
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({
          searchPayload: {
            data: {
              productData: [
                {
                  productName: PRODUCT_NAME,
                  productUrl: partnersProductUrl
                }
              ]
            }
          },
          deeplinkOk: false
        })
      });

      expect(result.status).toBe("bound");
      expect(result.productSearchApiCalled).toBe(true);
      expect(result.deeplinkApiCalled).toBe(false);
      expect(result.rawCoupangUrlPresent).toBe(true);
      expect(result.affiliateUrlPresent).toBe(true);
      expect(result.manifestChannelMatchesSelected).toBe(true);
      expect(result.manifestTargetChannelMatchesSelected).toBe(true);
      expect(result.localManifestWriteAllowed).toBe(true);
      expect(result.localManifestWritten).toBe(true);
      expect(JSON.stringify(result)).not.toContain(partnersProductUrl);
      expect(JSON.stringify(result)).not.toContain(manifestPath);

      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      expect(manifest.rawCoupangUrl).toContain("https://www.coupang.com/vp/products/111222333");
      expect(manifest.selectedAffiliateUrl).toBe(partnersProductUrl);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when the product search response has no usable Coupang candidate", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({
          searchPayload: {
            data: {
              productData: [
                {
                  productName: PRODUCT_NAME,
                  productUrl: "https://example.com/not-coupang"
                }
              ]
            }
          }
        })
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_COUPANG_PRODUCT_CANDIDATE_NOT_FOUND");
      expect(result.productSearchApiCalled).toBe(true);
      expect(result.deeplinkApiCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when Deeplink API does not return an affiliate URL", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({
          searchPayload: {
            data: [
              {
                productName: PRODUCT_NAME,
                productUrl: RAW_COUPANG_URL
              }
            ]
          },
          deeplinkOk: false
        })
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_COUPANG_DEEPLINK_FAILED");
      expect(result.productSearchApiCalled).toBe(true);
      expect(result.deeplinkApiCalled).toBe(true);
      expect(result.localManifestWritten).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when manifest path points at another channel manifest", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, {
        channelKey: "neoman_moleulgeol",
        targetChannelKey: "neoman_moleulgeol"
      }, "neoman_moleulgeol");
      const before = await readFile(manifestPath, "utf8");
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({
          searchPayload: {
            data: [
              {
                productName: PRODUCT_NAME,
                productUrl: RAW_COUPANG_URL
              }
            ]
          },
          deeplinkPayload: {
            data: [
              {
                shortenUrl: AFFILIATE_URL
              }
            ]
          }
        })
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_MANIFEST_CHANNEL_KEY_MISMATCH");
      expect(result.blockers).toContain("BLOCKED_V088_MANIFEST_TARGET_CHANNEL_KEY_MISMATCH");
      expect(result.manifestChannelMatchesSelected).toBe(false);
      expect(result.manifestTargetChannelMatchesSelected).toBe(false);
      expect(result.localManifestWriteAllowed).toBe(false);
      expect(result.localManifestWritten).toBe(false);
      expect(result.productSearchApiCalled).toBe(false);
      expect(result.deeplinkApiCalled).toBe(false);
      expect(await readFile(manifestPath, "utf8")).toBe(before);
      expect(JSON.stringify(result)).not.toContain(manifestPath);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when manifest channelKey is missing", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, { channelKey: undefined });
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({})
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_MANIFEST_CHANNEL_KEY_MISSING");
      expect(result.manifestChannelMatchesSelected).toBe(false);
      expect(result.localManifestWriteAllowed).toBe(false);
      expect(result.localManifestWritten).toBe(false);
      expect(result.productSearchApiCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when manifest targetChannelKey is missing", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd, { targetChannelKey: undefined });
      const result = await resolveV088CoupangProductSource({
        cwd,
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({})
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_MANIFEST_TARGET_CHANNEL_KEY_MISSING");
      expect(result.manifestTargetChannelMatchesSelected).toBe(false);
      expect(result.localManifestWriteAllowed).toBe(false);
      expect(result.localManifestWritten).toBe(false);
      expect(result.productSearchApiCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("blocks when selected channel does not match father_jobs resolver scope", async () => {
    const cwd = await makeCwd();
    try {
      const manifestPath = await writeManifest(cwd);
      const result = await resolveV088CoupangProductSource({
        cwd,
        channelKey: "lets_buy",
        env: readyEnv(manifestPath),
        fetchImpl: mockFetch({})
      });

      expect(result.status).toBe("blocked");
      expect(result.blockers).toContain("BLOCKED_V088_SELECTED_CHANNEL_KEY_MISMATCH");
      expect(result.blockers).toContain("BLOCKED_V088_MANIFEST_CHANNEL_KEY_MISMATCH");
      expect(result.blockers).toContain("BLOCKED_V088_MANIFEST_TARGET_CHANNEL_KEY_MISMATCH");
      expect(result.localManifestWriteAllowed).toBe(false);
      expect(result.localManifestWritten).toBe(false);
      expect(result.productSearchApiCalled).toBe(false);
      expect(JSON.stringify(result)).not.toMatch(FORBIDDEN_PATTERN);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v088-"));
}

async function writeManifest(
  cwd: string,
  overrides: Record<string, unknown> = {},
  channelDir = "father_jobs"
) {
  const manifestPath = path.join(cwd, "commerce-assets", "review", "v057", channelDir, "product-source-v057.local.json");
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const manifest = {
    productSourceId: "ps-father-v057",
    queueItemId: "queue-father-v057",
    uploadPackageId: "upload-father-v057",
    channelKey: "father_jobs",
    targetChannelKey: "father_jobs",
    productName: PRODUCT_NAME,
    rawCoupangUrl: "",
    selectedAffiliateUrl: "",
    ...overrides
  };
  for (const [key, value] of Object.entries(manifest)) {
    if (value === undefined) delete (manifest as Record<string, unknown>)[key];
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

function readyEnv(manifestPath: string) {
  return {
    V088_PRODUCT_SOURCE_MANIFEST_PATH: manifestPath,
    COUPANG_PARTNERS_PROVIDER_ENABLED: "true",
    COUPANG_ACCESS_KEY: "access-key-v088",
    COUPANG_SECRET_KEY: "secret-key-v088",
    COUPANG_PARTNER_ID: "partner-v088",
    COUPANG_PARTNERS_BASE_URL: "https://api-gateway.coupang.com"
  };
}

function mockFetch(options: {
  searchPayload?: unknown;
  searchOk?: boolean;
  deeplinkPayload?: unknown;
  deeplinkOk?: boolean;
}) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "POST") {
      return response(options.deeplinkPayload ?? { data: [] }, options.deeplinkOk ?? true);
    }
    return response(options.searchPayload ?? {}, options.searchOk ?? true);
  }) as typeof fetch;
}

function response(payload: unknown, ok: boolean) {
  return {
    ok,
    json: async () => payload
  } as Response;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
