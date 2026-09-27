import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/fileStore";
import { enqueueYouTubePublicUploadJob, type YouTubePublicPublisherState, type YouTubePublicUploadJob } from "@/lib/youtube-public-publisher/publisher";
import { isYouTubePublicPublisherChannelKey } from "@/lib/youtube-public-publisher/channelConfig";
import { FAST_PRODUCTION_DISCLOSURE, fastProductionModeEnabled, verifyFastProductionReview, type FastProductionReview } from "@/lib/video-automation/fastProductionReview";

type FastQueueInput = { qaPath: string; productUrl: string; channelKey: string };

export async function enqueueFastProduct(input: FastQueueInput, env = process.env, cwd = process.cwd()) {
  if (!fastProductionModeEnabled(env)) return { created: false, safeError: "FAST_PRODUCTION_MODE_DISABLED" };
  const statePath = env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH?.trim() ?? "";
  if (!statePath || !isAbsolute(statePath) || insideRepo(statePath, cwd)) return { created: false, safeError: "PUBLISHER_STATE_PATH_INVALID" };
  if (!isAbsolute(input.qaPath) || !isYouTubePublicPublisherChannelKey(input.channelKey)) return { created: false, safeError: "FAST_PRODUCT_INPUT_INVALID" };
  const productUrl = new URL(input.productUrl);
  if (productUrl.protocol !== "https:" || !["www.coupang.com", "link.coupang.com"].includes(productUrl.hostname)) {
    return { created: false, safeError: "PRODUCT_URL_INVALID" };
  }
  const raw = JSON.parse(await readFile(input.qaPath, "utf8")) as FastProductionReview & { videoPath?: string; publicationEligibility?: string };
  if (!raw.videoPath || !isAbsolute(raw.videoPath) || raw.publicationEligibility !== "READY") return { created: false, safeError: "FAST_PRODUCT_VIDEO_NOT_READY" };
  const sha = createHash("sha256").update(await readFile(raw.videoPath)).digest("hex");
  const review = verifyFastProductionReview({ review: raw, productId: raw.productId, canonicalProductName: raw.canonicalProductName,
    videoSha256: sha, disclosureText: FAST_PRODUCTION_DISCLOSURE });
  if (!review.ok) return { created: false, safeError: review.safeError };
  const now = new Date().toISOString();
  const job: YouTubePublicUploadJob = {
    id: `fast-product-${sha.slice(0, 24)}`, productId: raw.productId, channelKey: input.channelKey,
    videoPath: raw.videoPath, videoSha256: sha, affiliateUrl: "", productUrl: productUrl.toString(), affiliateProductId: raw.productId,
    canonicalProductName: raw.canonicalProductName, metadataProductName: raw.canonicalProductName,
    title: `${raw.canonicalProductName.slice(0, 85)} #Shorts`,
    description: `${raw.canonicalProductName}\n${productUrl.toString()}\n\n${FAST_PRODUCTION_DISCLOSURE}`,
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
