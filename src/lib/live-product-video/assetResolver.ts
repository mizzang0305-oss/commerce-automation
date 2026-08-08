import { mkdir, rm, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { validateCandidateImageUrl } from "@/lib/coupang/coupangImage";
import { runJsonProcess } from "@/lib/video-automation/localRuntime";
import type { LiveProductCandidate, ResolvedExactProductReference } from "./types";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function resolveExactProductReference(input: {
  candidate: LiveProductCandidate;
  outputDir: string;
  pythonExe: string;
  visualQaScript: string;
  fetchImpl?: typeof fetch;
  probeImage?: (path: string) => Promise<{ width: number; height: number; sizeBytes: number }>;
}): Promise<ResolvedExactProductReference> {
  const sourceUrl = input.candidate.productImageUrls.find((value) => validateCandidateImageUrl(value).ok) ?? "";
  if (!sourceUrl || !isTrustedCoupangImageUrl(sourceUrl)) throw new Error("PRODUCT_IMAGE_NOT_READY");
  let response: Response;
  try {
    response = await (input.fetchImpl ?? fetch)(sourceUrl, { method: "GET", redirect: "follow" });
  } catch {
    throw new Error("PRODUCT_IMAGE_DOWNLOAD_FAILED");
  }
  if (!response.ok) throw new Error("PRODUCT_IMAGE_DOWNLOAD_FAILED");
  if (response.url && !isTrustedCoupangImageUrl(response.url)) throw new Error("PRODUCT_IMAGE_REDIRECT_BLOCKED");
  const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error("PRODUCT_IMAGE_MIME_INVALID");
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("PRODUCT_IMAGE_SIZE_INVALID");
  await mkdir(input.outputDir, { recursive: true });
  const extension = extensionFor(mimeType, sourceUrl);
  const localPath = resolve(join(input.outputDir, `exact-product-reference${extension}`));
  await writeFile(localPath, bytes);
  try {
    const probe = input.probeImage
      ? await input.probeImage(localPath)
      : await defaultProbe(localPath, input.pythonExe, input.visualQaScript);
    if (!Number.isFinite(probe.width) || !Number.isFinite(probe.height) || probe.width < 320 || probe.height < 320) {
      throw new Error("PRODUCT_IMAGE_DIMENSIONS_INVALID");
    }
    return { sourceUrl, localPath, width: probe.width, height: probe.height, mimeType, sizeBytes: probe.sizeBytes, identityType: "product_reference" };
  } catch {
    await rm(localPath, { force: true });
    throw new Error("PRODUCT_IMAGE_DECODE_FAILED");
  }
}

async function defaultProbe(path: string, pythonExe: string, visualQaScript: string) {
  const result = await runJsonProcess(pythonExe, [visualQaScript], { operation: "validate_image", image_path: path }, 60_000);
  if (result.status !== "success" || result.decoded !== true) throw new Error("PRODUCT_IMAGE_DECODE_FAILED");
  return { width: Number(result.width), height: Number(result.height), sizeBytes: Number(result.size_bytes) };
}

function extensionFor(mimeType: string, sourceUrl: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  const sourceExtension = extname(new URL(sourceUrl).pathname).toLowerCase();
  return [".jpg", ".jpeg"].includes(sourceExtension) ? sourceExtension : ".jpg";
}

function isTrustedCoupangImageUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      hostname === "image.coupangcdn.com" ||
      hostname === "thumbnail.coupangcdn.com" ||
      hostname === "ads-partners.coupang.com" ||
      hostname.endsWith(".coupangcdn.com")
    );
  } catch {
    return false;
  }
}
