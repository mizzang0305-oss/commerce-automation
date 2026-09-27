import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/fileStore";
import { enqueueYouTubePublicUploadJob, type YouTubePublicPublisherState, type YouTubePublicUploadJob } from "@/lib/youtube-public-publisher/publisher";
import { isYouTubePublicPublisherChannelKey } from "@/lib/youtube-public-publisher/channelConfig";
import { FAST_PRODUCTION_DISCLOSURE, fastProductionModeEnabled, verifyFastProductionReview, type FastProductionReview } from "@/lib/video-automation/fastProductionReview";

type FastQueueInput = { qaPath: string; productUrl: string; affiliateUrl?: string; channelKey: string };

export async function enqueueFastProduct(input: FastQueueInput, env = process.env, cwd = process.cwd()) {
  if (!fastProductionModeEnabled(env)) return { created: false, safeError: "FAST_PRODUCTION_MODE_DISABLED" };
  const statePath = env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH?.trim() ?? "";
  if (!statePath || !isAbsolute(statePath) || insideRepo(statePath, cwd)) return { created: false, safeError: "PUBLISHER_STATE_PATH_INVALID" };
  if (!isAbsolute(input.qaPath) || !isYouTubePublicPublisherChannelKey(input.channelKey)) return { created: false, safeError: "FAST_PRODUCT_INPUT_INVALID" };
  const productUrl = new URL(input.productUrl);
  if (productUrl.protocol !== "https:" || productUrl.hostname !== "www.coupang.com") {
    return { created: false, safeError: "PRODUCT_URL_INVALID" };
  }
  const raw = JSON.parse(await readFile(input.qaPath, "utf8")) as FastProductionReview & { videoPath?: string; publicationEligibility?: string };
  const match = /^coupang:product:(\d+):item:(\d+):vendor:(\d+)$/u.exec(raw.productId);
  if (!match || productUrl.pathname !== `/vp/products/${match[1]}` || productUrl.searchParams.get("itemId") !== match[2] || productUrl.searchParams.get("vendorItemId") !== match[3]) {
    return { created: false, safeError: "PRODUCT_URL_IDENTITY_MISMATCH" };
  }
  const affiliateUrl = input.affiliateUrl?.trim() ?? "";
  if (env.FAST_PRODUCTION_REQUIRE_AFFILIATE_URL === "true" && !affiliateUrl) return { created: false, safeError: "AFFILIATE_URL_REQUIRED" };
  if (affiliateUrl) {
    let affiliate: URL;
    try { affiliate = new URL(affiliateUrl); } catch { return { created: false, safeError: "AFFILIATE_URL_INVALID" }; }
    if (affiliate.protocol !== "https:" || affiliate.hostname !== "link.coupang.com" || !/^\/(?:a|re)\/[^/]+$/u.test(affiliate.pathname) ||
        affiliate.searchParams.get("pageKey") !== match[1] || affiliate.searchParams.get("itemId") !== match[2] || affiliate.searchParams.get("vendorItemId") !== match[3]) {
      return { created: false, safeError: "AFFILIATE_URL_IDENTITY_MISMATCH" };
    }
  }
  if (!raw.videoPath || !isAbsolute(raw.videoPath) || raw.publicationEligibility !== "READY") return { created: false, safeError: "FAST_PRODUCT_VIDEO_NOT_READY" };
  const sha = createHash("sha256").update(await readFile(raw.videoPath)).digest("hex");
  const review = verifyFastProductionReview({ review: raw, productId: raw.productId, canonicalProductName: raw.canonicalProductName,
    videoSha256: sha, disclosureText: FAST_PRODUCTION_DISCLOSURE });
  if (!review.ok) return { created: false, safeError: review.safeError };
  const now = new Date().toISOString();
  const job: YouTubePublicUploadJob = {
    id: `fast-product-${sha.slice(0, 24)}`, productId: raw.productId, channelKey: input.channelKey,
    videoPath: raw.videoPath, videoSha256: sha, affiliateUrl, productUrl: productUrl.toString(), affiliateProductId: raw.productId,
    canonicalProductName: raw.canonicalProductName, metadataProductName: raw.canonicalProductName,
    title: `${raw.canonicalProductName.slice(0, 85)} #Shorts`,
    description: `${raw.canonicalProductName}\n\n상품 확인:\n${affiliateUrl || productUrl.toString()}\n\n${FAST_PRODUCTION_DISCLOSURE}`,
    disclosureText: FAST_PRODUCTION_DISCLOSURE, machineQaStatus: "passed", fastProductionReview: raw,
    visibility: "unlisted", status: "ready", attemptCount: 0, claimedAt: "", claimOwner: "", lastError: "",
    youtubeVideoId: "", youtubeUrl: "", publishedAt: "", createdAt: now, updatedAt: now
  };
  const store = new FileYouTubePublicPublisherStore<YouTubePublicPublisherState>(resolve(statePath), { jobs: [], ledger: [] });
  return enqueueYouTubePublicUploadJob(store, job);
}

function insideRepo(path: string, cwd: string) {
  const value = relative(resolve(cwd), resolve(path));
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

export async function main(inputPath = process.argv[2]) {
  if (!inputPath || !isAbsolute(inputPath)) throw new Error("FAST_PRODUCT_INPUT_PATH_REQUIRED");
  const input = JSON.parse(await readFile(inputPath, "utf8")) as FastQueueInput;
  const result = await enqueueFastProduct(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.created) process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main();
}
