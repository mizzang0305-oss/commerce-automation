import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { runExitProcess, runJsonProcess } from "@/lib/video-automation/localRuntime";
import { FAST_PRODUCTION_DISCLOSURE, type FastProductionReview } from "@/lib/video-automation/fastProductionReview";
import type { SimpleProducerPipelineInput, SimpleProducerPipelineResult } from "./types";

type FreshQueueItem = {
  sourcePath: string;
  imageUrls: string[];
  displayName: string;
  useCase: "vehicle_organization" | "laundry_drying";
};

const PRODUCT_ID = /^coupang:product:(\d+):item:(\d+):vendor:(\d+)$/u;
const IMAGE_HOSTS = new Set(["thumbnail.coupangcdn.com", "image.coupangcdn.com", "ads-partners.coupang.com"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Existing Simple Producer queue adapter. Image motion and QA remain in render-fast-image-shorts.py. */
export async function executeFreshImageShortsQueue(input: SimpleProducerPipelineInput & {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  queuePath: string;
  fetchImpl?: typeof fetch;
}): Promise<SimpleProducerPipelineResult> {
  if (!isAbsolute(input.queuePath) || inside(input.queuePath, input.cwd)) throw new Error("FRESH_QUEUE_PATH_INVALID");
  const queue = JSON.parse(await readFile(input.queuePath, "utf8")) as { schema?: string; items?: FreshQueueItem[] };
  if (queue.schema !== "fresh-product-image-shorts-queue/v1" || !Array.isArray(queue.items)) throw new Error("FRESH_QUEUE_INVALID");
  const candidates = queue.items.slice(0, 3);
  const root = resolve(input.outputRoot, "fresh-image-shorts", input.runId);
  await mkdir(root, { recursive: true });
  const holds: Array<{ productId: string; reason: string }> = [];
  for (const [index, candidate] of candidates.entries()) {
    let productId = "";
    try {
      if (!candidate || !isAbsolute(candidate.sourcePath) || inside(candidate.sourcePath, input.cwd)) throw new Error("FRESH_SOURCE_PATH_INVALID");
      const source = JSON.parse(await readFile(candidate.sourcePath, "utf8")) as Record<string, unknown>;
      productId = String(source.productKey ?? "");
      if (input.excludedProductIds.includes(productId)) throw new Error("PRODUCT_ALREADY_QUEUED");
      const item = await prepareOne({ ...input, candidate, source, root: join(root, `candidate-${index + 1}`), productId });
      await writeFile(join(root, "selection-summary.json"), JSON.stringify({ selectedProductId: productId, holds }, null, 2), "utf8");
      return { ok: true, safeError: "", searchCalls: 0, rawProductsFound: candidates.length, eligibleProductsFound: 1, item };
    } catch (error) {
      holds.push({ productId, reason: safeError(error) });
    }
  }
  await writeFile(join(root, "selection-summary.json"), JSON.stringify({ selectedProductId: null, holds }, null, 2), "utf8");
  return { ok: false, safeError: holds[holds.length - 1]?.reason ?? "FRESH_QUEUE_EMPTY", searchCalls: 0,
    rawProductsFound: candidates.length, eligibleProductsFound: 0, item: null };
}

async function prepareOne(input: {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  candidate: FreshQueueItem;
  source: Record<string, unknown>;
  root: string;
  productId: string;
  fetchImpl?: typeof fetch;
}) {
  const match = PRODUCT_ID.exec(input.productId);
  const sourceName = String(input.source.canonicalProductName ?? "").trim();
  const displayName = input.candidate.displayName.trim();
  const name = displayName;
  const raw = parseUrl(String(input.source.rawProductUrl ?? ""));
  const affiliate = parseUrl(String(input.source.selectedAffiliateUrl ?? ""));
  if (!match || !sourceName || !displayName ||
      !displayName.split(/\s+/u).every((word) => sourceName.toLocaleLowerCase().includes(word.toLocaleLowerCase())) ||
      raw.hostname !== "www.coupang.com" || raw.pathname !== `/vp/products/${match[1]}` ||
      raw.searchParams.get("itemId") !== match[2] || raw.searchParams.get("vendorItemId") !== match[3] ||
      affiliate.hostname !== "link.coupang.com" || !/^\/(?:a|re)\/[^/]+$/u.test(affiliate.pathname) ||
      affiliate.searchParams.get("pageKey") !== match[1] || affiliate.searchParams.get("itemId") !== match[2] ||
      affiliate.searchParams.get("vendorItemId") !== match[3]) throw new Error("FRESH_PRODUCT_IDENTITY_INVALID");
  if (!Array.isArray(input.candidate.imageUrls) || input.candidate.imageUrls.length < 3) throw new Error("INSUFFICIENT_PRODUCT_IMAGES");
  await mkdir(input.root, { recursive: true });
  const images: string[] = [];
  const hashes = new Set<string>();
  const urls = [...new Set(input.candidate.imageUrls)].slice(0, 8);
  for (const [index, value] of urls.entries()) {
    const url = parseUrl(value);
    if (!IMAGE_HOSTS.has(url.hostname)) continue;
    try {
      const response = await (input.fetchImpl ?? fetch)(url, { method: "GET", redirect: "follow" });
      const final = parseUrl(response.url || value);
      const mime = (response.headers.get("content-type") ?? "").split(";")[0].toLowerCase();
      if (!response.ok || !IMAGE_HOSTS.has(final.hostname) || !["image/jpeg", "image/png", "image/webp"].includes(mime)) continue;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) continue;
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (hashes.has(sha)) continue;
      hashes.add(sha);
      const path = join(input.root, `source-${index}.${mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg"}`);
      await writeFile(path, bytes);
      images.push(path);
    } catch { /* one image failure holds only this candidate if fewer than three remain */ }
  }
  if (images.length < 3) throw new Error("INSUFFICIENT_PRODUCT_IMAGES");
  const python = input.env.VIDEO_AUTOMATION_PYTHON?.trim() ?? "";
  const ttsCommand = input.env.VIDEO_AUTOMATION_TTS_COMMAND?.trim() ?? "";
  if (!python || !ttsCommand) throw new Error("FRESH_TTS_RUNTIME_MISSING");
  const hook = input.candidate.useCase === "vehicle_organization" ? "차 안 물건, 한곳에 정리해 보세요" : "빨래 건조 공간을 살펴보세요";
  const script = input.candidate.useCase === "vehicle_organization" ? "컵과 휴지, 휴대폰을 한곳에 놓을 수 있어요. 상품 정보는 설명에서 확인하세요." : "접이식 구조와 크기를 상품 상세에서 확인하세요.";
  const narration = `${displayName}. ${hook}. ${script}`;
  const audioPath = join(input.root, "tts.wav");
  const tts = await runJsonProcess(python, [resolve(input.cwd, "tools/video-automation/local_media_bridge.py")],
    { operation: "tts", text: narration, target: audioPath, command: ttsCommand }, 660_000);
  const audioSeconds = Number(tts.duration_seconds);
  if (tts.status !== "success" || !Number.isFinite(audioSeconds) || audioSeconds <= 0 || audioSeconds > 17.5) throw new Error("FRESH_TTS_NOT_READY");
  const duration = Math.min(18, Math.max(12, Math.ceil(audioSeconds + 0.5)));
  const captions = input.candidate.useCase === "vehicle_organization"
    ? ["차량 뒷좌석 수납", "컵·휴지·휴대폰 정리", "상품 정보는 설명에서 확인"]
    : ["접이식 건조 공간", "크기와 옵션 확인", "상품 정보는 설명에서 확인"];
  const renderRoot = join(input.root, "render");
  const renderItem = { id: "fresh-product", productId: input.productId, sourceProductId: input.productId,
    canonicalProductName: name, metadataProductName: name, displayName, images: images.slice(0, 3), captions,
    audioPath, audioEndSeconds: audioSeconds, durationSeconds: duration, rightsBasis: "OWNER_ASSERTED_DETAIL_IMAGES_ALLOWED_20260927",
    disclosureText: FAST_PRODUCTION_DISCLOSURE };
  await writeFile(join(input.root, "render-input.json"), JSON.stringify({ outputRoot: renderRoot, items: [renderItem] }, null, 2), "utf8");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const attemptConfig = join(input.root, `render-input-${attempt}.json`);
    const attemptRoot = `${renderRoot}-${attempt}`;
    await writeFile(attemptConfig, JSON.stringify({ outputRoot: attemptRoot, items: [renderItem] }, null, 2), "utf8");
    try {
      await runExitProcess(python, [resolve(input.cwd, "scripts/video-automation/render-fast-image-shorts.py"), attemptConfig], 900_000);
      const summary = JSON.parse(await readFile(join(attemptRoot, "summary.json"), "utf8")) as { items?: Array<FastProductionReview & { videoPath?: string; publicationEligibility?: string }> };
      const qa = summary.items?.[0];
      if (qa?.publicationEligibility === "READY" && qa.videoPath && Array.isArray(qa.sourceImageSha256) && qa.sourceImageSha256.length >= 3) {
        return { productId: input.productId, canonicalProductName: name, affiliateUrl: affiliate.toString(),
          useCase: input.candidate.useCase, videoPath: qa.videoPath, machineQaPassed: true, fastProductionReview: qa };
      }
    } catch { /* one bounded render retry */ }
  }
  throw new Error("FRESH_RENDER_FAILED");
}

function parseUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return url;
  } catch { /* safe error below */ }
  throw new Error("FRESH_URL_INVALID");
}

function inside(candidate: string, root: string) {
  const value = relative(resolve(root), resolve(candidate));
  return value === "" || (!value.startsWith("..") && !isAbsolute(value));
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_:-]+$/u.test(message) ? message : "FRESH_PRODUCT_FAILED";
}
