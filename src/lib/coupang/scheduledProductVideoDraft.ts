import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { buildScheduledEventProductPreview } from "@/lib/coupang/scheduledEventProductProvider";
import type { CollectedProduct } from "@/lib/orchestration/commercePocSchemas";
import type { CommerceDailySlotId } from "@/lib/orchestration/commerceDailyCadence";

const execFileAsync = promisify(execFile);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REDIRECTS = 2;
const DRAFT_DURATION_SECONDS = 12;
const DISCLOSURE_TEXT = "※ 이 콘텐츠는 쿠팡파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받을 수 있습니다.";

export const SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL = "APPROVE_SCHEDULED_PRODUCT_VIDEO_DRAFT_RENDER";

export type ScheduledProductVideoDraftPlan = {
  mode: "scheduled_product_video_draft";
  schedule_id: string;
  slot_id: CommerceDailySlotId;
  slot_label: string;
  local_time: string;
  event_name: string;
  primary_keyword: string;
  product: CollectedProduct;
  copy: {
    hook: string;
    product_intro: string;
    review_point: string;
    caution: string;
    cta: string;
    title: string;
    youtube_description: string;
    tiktok_caption: string;
    disclosure_text: typeof DISCLOSURE_TEXT;
  };
  quality: {
    status: "draft_preview_only";
    duration_seconds: typeof DRAFT_DURATION_SECONDS;
    single_product_image_only: true;
    voiceover_present: false;
    real_usage_scenes_present: false;
    owner_review_required: true;
    blockers: [
      "DRAFT_SINGLE_IMAGE_VIDEO",
      "VOICEOVER_REQUIRED",
      "REAL_USAGE_SCENES_REQUIRED",
      "OWNER_REVIEW_REQUIRED",
      "PLATFORM_UPLOAD_NOT_CONNECTED"
    ];
  };
  side_effects: {
    image_download_allowed: true;
    local_video_write_allowed: true;
    external_upload: false;
    database_write: false;
    r2_write: false;
    queue_write: false;
    worker_job_created: false;
    publish_attempted: false;
    SAFE_TO_UPLOAD: false;
    SAFE_TO_PUBLIC_UPLOAD: false;
  };
};

export type ScheduledProductVideoDraftRenderResult = {
  ok: boolean;
  blocker: "SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL_REQUIRED" | "SCHEDULED_PRODUCT_VIDEO_DRAFT_RENDER_FAILED" | null;
  plan: ScheduledProductVideoDraftPlan;
  local_video_path: string | null;
  manifest_path: string | null;
  video_generated: boolean;
  image_downloaded: boolean;
  ffmpeg_executed: boolean;
  publish_attempted: false;
  SAFE_TO_UPLOAD: false;
  SAFE_TO_PUBLIC_UPLOAD: false;
};

type ExecFileAsync = (
  file: string,
  args: string[],
  options: { timeout: number; windowsHide: boolean; maxBuffer: number }
) => Promise<{ stdout: string; stderr: string }>;

type RenderDependencies = {
  cwd?: string;
  fetchImpl?: typeof fetch;
  execFileAsync?: ExecFileAsync;
  mkdir?: typeof fs.mkdir;
  writeFile?: typeof fs.writeFile;
  readFile?: typeof fs.readFile;
  stat?: typeof fs.stat;
};

export function buildScheduledProductVideoDraftPlan(input: {
  slotId: CommerceDailySlotId;
  products: CollectedProduct[];
  now?: string | Date;
}): ScheduledProductVideoDraftPlan {
  const preview = buildScheduledEventProductPreview(input);
  if (!preview.product || !preview.event || !preview.primary_keyword) {
    throw new Error("SCHEDULED_PRODUCT_VIDEO_DRAFT_INPUT_NOT_READY");
  }
  const profile = copyProfile(preview.primary_keyword);
  const productName = preview.product.product_name;
  const eventName = preview.event.name;
  const priceLabel = preview.product.price === null
    ? "가격은 원본 페이지에서 확인"
    : `${preview.product.price.toLocaleString("ko-KR")}원`;
  const title = `[${eventName}] ${shorten(productName, 48)} 구매 전 확인`;
  const hook = `${eventName} 준비, 지금 확인할 상품은?`;
  const productIntro = shorten(productName, 66);
  const reviewPoint = profile.reviewPoint;
  const caution = "구성·옵션·크기·배송 조건은 원본 페이지에서 확인하세요.";
  const cta = `${priceLabel} · 자세한 정보는 설명란 링크에서 확인`;
  const description = [
    hook,
    productIntro,
    reviewPoint,
    caution,
    DISCLOSURE_TEXT,
    preview.product.source_url
  ].join("\n\n");

  return {
    mode: "scheduled_product_video_draft",
    schedule_id: preview.schedule_id,
    slot_id: preview.slot.id,
    slot_label: preview.slot.label,
    local_time: preview.slot.local_time,
    event_name: eventName,
    primary_keyword: preview.primary_keyword,
    product: preview.product,
    copy: {
      hook,
      product_intro: productIntro,
      review_point: reviewPoint,
      caution,
      cta,
      title,
      youtube_description: description,
      tiktok_caption: `${hook} ${profile.hashtags.join(" ")}\n${DISCLOSURE_TEXT}`,
      disclosure_text: DISCLOSURE_TEXT
    },
    quality: {
      status: "draft_preview_only",
      duration_seconds: DRAFT_DURATION_SECONDS,
      single_product_image_only: true,
      voiceover_present: false,
      real_usage_scenes_present: false,
      owner_review_required: true,
      blockers: [
        "DRAFT_SINGLE_IMAGE_VIDEO",
        "VOICEOVER_REQUIRED",
        "REAL_USAGE_SCENES_REQUIRED",
        "OWNER_REVIEW_REQUIRED",
        "PLATFORM_UPLOAD_NOT_CONNECTED"
      ]
    },
    side_effects: {
      image_download_allowed: true,
      local_video_write_allowed: true,
      external_upload: false,
      database_write: false,
      r2_write: false,
      queue_write: false,
      worker_job_created: false,
      publish_attempted: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    }
  };
}

export async function renderScheduledProductVideoDraft(input: {
  plan: ScheduledProductVideoDraftPlan;
  approval?: string;
  dependencies?: RenderDependencies;
}): Promise<ScheduledProductVideoDraftRenderResult> {
  if (input.approval !== SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL) {
    return blockedResult("SCHEDULED_PRODUCT_VIDEO_DRAFT_APPROVAL_REQUIRED", input.plan);
  }
  const dependencies = input.dependencies ?? {};
  const cwd = dependencies.cwd ?? process.cwd();
  const mkdir = dependencies.mkdir ?? fs.mkdir;
  const writeFile = dependencies.writeFile ?? fs.writeFile;
  const readFile = dependencies.readFile ?? fs.readFile;
  const stat = dependencies.stat ?? fs.stat;
  const run = dependencies.execFileAsync ?? execFileAsync;
  const outputDirectory = path.join(cwd, "data", "commerce-poc", "video-drafts", input.plan.slot_id);
  const outputVideoPath = path.join(outputDirectory, "preview.mp4");
  const manifestPath = path.join(outputDirectory, "manifest.json");
  let imageDownloaded = false;
  let ffmpegExecuted = false;

  try {
    await mkdir(outputDirectory, { recursive: true });
    const image = await downloadScheduledProductImage(input.plan.product.image_url, dependencies.fetchImpl ?? fetch);
    imageDownloaded = true;
    const imagePath = path.join(outputDirectory, `product-image.${extensionForMimeType(image.mimeType)}`);
    const hookPath = path.join(outputDirectory, "hook.txt");
    const productPath = path.join(outputDirectory, "product.txt");
    const ctaPath = path.join(outputDirectory, "cta.txt");
    await writeFile(imagePath, image.buffer);
    await writeFile(hookPath, wrapKoreanText(input.plan.copy.hook, 18, 2), "utf8");
    await writeFile(productPath, wrapKoreanText(input.plan.copy.product_intro, 18, 3), "utf8");
    await writeFile(ctaPath, wrapKoreanText(input.plan.copy.cta, 20, 2), "utf8");
    ffmpegExecuted = true;
    await run("ffmpeg", buildScheduledProductVideoDraftFfmpegArgs({
      imagePath,
      hookPath,
      productPath,
      ctaPath,
      outputVideoPath
    }), {
      timeout: 120000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 8
    });
    const videoStat = await stat(outputVideoPath);
    if (!videoStat.isFile() || videoStat.size <= 0) {
      throw new Error("SCHEDULED_PRODUCT_VIDEO_DRAFT_OUTPUT_EMPTY");
    }
    await writeFile(manifestPath, JSON.stringify({
      ...input.plan,
      product: {
        product_name: input.plan.product.product_name,
        price: input.plan.product.price,
        seller: input.plan.product.seller,
        raw_hash: input.plan.product.raw_hash
      },
      render: {
        video_generated: true,
        mime_type: "video/mp4",
        size_bytes: videoStat.size,
        checksum_sha256: createHash("sha256").update(await readFile(outputVideoPath)).digest("hex"),
        local_only: true,
        external_upload: false
      }
    }, null, 2), "utf8");
    return {
      ok: true,
      blocker: null,
      plan: input.plan,
      local_video_path: outputVideoPath,
      manifest_path: manifestPath,
      video_generated: true,
      image_downloaded: true,
      ffmpeg_executed: true,
      publish_attempted: false,
      SAFE_TO_UPLOAD: false,
      SAFE_TO_PUBLIC_UPLOAD: false
    };
  } catch {
    return {
      ...blockedResult("SCHEDULED_PRODUCT_VIDEO_DRAFT_RENDER_FAILED", input.plan),
      image_downloaded: imageDownloaded,
      ffmpeg_executed: ffmpegExecuted
    };
  }
}

export async function downloadScheduledProductImage(imageUrl: string, fetchImpl: typeof fetch) {
  let currentUrl = validateScheduledProductImageUrl(imageUrl);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetchImpl(currentUrl, {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "image/jpeg,image/png,image/webp" },
      signal: AbortSignal.timeout(15000)
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirectCount === MAX_REDIRECTS) {
        throw new Error("SCHEDULED_PRODUCT_IMAGE_REDIRECT_BLOCKED");
      }
      currentUrl = validateScheduledProductImageUrl(new URL(location, currentUrl).toString());
      continue;
    }
    if (!response.ok) {
      throw new Error("SCHEDULED_PRODUCT_IMAGE_HTTP_ERROR");
    }
    const mimeType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
    if (!allowedImageMimeTypes.has(mimeType)) {
      throw new Error("SCHEDULED_PRODUCT_IMAGE_CONTENT_TYPE_BLOCKED");
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      throw new Error("SCHEDULED_PRODUCT_IMAGE_TOO_LARGE");
    }
    const buffer = await readBoundedResponseBody(response);
    if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
      throw new Error("SCHEDULED_PRODUCT_IMAGE_TOO_LARGE");
    }
    if (!hasExpectedImageSignature(buffer, mimeType)) {
      throw new Error("SCHEDULED_PRODUCT_IMAGE_SIGNATURE_BLOCKED");
    }
    return { buffer, mimeType, finalHost: new URL(currentUrl).hostname };
  }
  throw new Error("SCHEDULED_PRODUCT_IMAGE_REDIRECT_BLOCKED");
}

async function readBoundedResponseBody(response: Response) {
  if (!response.body) {
    throw new Error("SCHEDULED_PRODUCT_IMAGE_BODY_MISSING");
  }
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_IMAGE_BYTES) {
      await reader.cancel();
      throw new Error("SCHEDULED_PRODUCT_IMAGE_TOO_LARGE");
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

export function validateScheduledProductImageUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  const trusted = hostname === "ads-partners.coupang.com" || hostname.endsWith(".coupangcdn.com");
  if (url.protocol !== "https:" || !trusted || url.username || url.password) {
    throw new Error("SCHEDULED_PRODUCT_IMAGE_HOST_BLOCKED");
  }
  return url.toString();
}

export function buildScheduledProductVideoDraftFfmpegArgs(input: {
  imagePath: string;
  hookPath: string;
  productPath: string;
  ctaPath: string;
  outputVideoPath: string;
}) {
  const filter = [
    "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=32,eq=brightness=-0.28[bg]",
    "[0:v]scale=900:980:force_original_aspect_ratio=decrease,pad=900:980:(ow-iw)/2:(oh-ih)/2:color=white@0.04[product]",
    "[bg][product]overlay=90:430[base]",
    "[base]drawbox=x=50:y=110:w=980:h=250:color=black@0.68:t=fill[top]",
    `[top]drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf")}':textfile='${escapeFilterPath(input.hookPath)}':expansion=none:fontcolor=white:fontsize=58:line_spacing=10:x=90:y=155[hook]`,
    "[hook]drawbox=x=50:y=1410:w=980:h=390:color=black@0.72:t=fill[bottom]",
    `[bottom]drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgunbd.ttf")}':textfile='${escapeFilterPath(input.productPath)}':expansion=none:fontcolor=white:fontsize=45:line_spacing=8:x=90:y=1460[producttext]`,
    `[producttext]drawtext=fontfile='${escapeFilterPath("C:/Windows/Fonts/malgun.ttf")}':textfile='${escapeFilterPath(input.ctaPath)}':expansion=none:fontcolor=0x99f6e4:fontsize=34:line_spacing=6:x=90:y=1665,fade=t=in:st=0:d=0.4,fade=t=out:st=11:d=1[out]`
  ].join(";");
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    input.imagePath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000",
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-map",
    "1:a",
    "-t",
    String(DRAFT_DURATION_SECONDS),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    "-shortest",
    input.outputVideoPath
  ];
}

function blockedResult(
  blocker: Exclude<ScheduledProductVideoDraftRenderResult["blocker"], null>,
  plan: ScheduledProductVideoDraftPlan
): ScheduledProductVideoDraftRenderResult {
  return {
    ok: false,
    blocker,
    plan,
    local_video_path: null,
    manifest_path: null,
    video_generated: false,
    image_downloaded: false,
    ffmpeg_executed: false,
    publish_attempted: false,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

function copyProfile(keyword: string) {
  if (/문구|학용품|색연필|파일/.test(keyword)) {
    return {
      reviewPoint: "상품명 기준으로 문구 구성과 수량을 확인할 후보입니다.",
      hashtags: ["#방학준비", "#문구", "#학용품"]
    };
  }
  if (/캠핑|의자|보냉|야외/.test(keyword)) {
    return {
      reviewPoint: "상품명 기준으로 의자 구성·수량·옵션을 확인할 후보입니다.",
      hashtags: ["#캠핑", "#야외활동", "#휴가준비"]
    };
  }
  if (/선풍기|냉감|여름|보양/.test(keyword)) {
    return {
      reviewPoint: "상품명 기준으로 형태·단계·옵션을 확인할 후보입니다.",
      hashtags: ["#여름준비", "#휴대용선풍기", "#무더위"]
    };
  }
  return {
    reviewPoint: "상품명과 원본 페이지를 기준으로 구성·옵션을 확인할 후보입니다.",
    hashtags: ["#생활용품", "#구매전확인"]
  };
}

function wrapKoreanText(value: string, maxUnits: number, maxLines: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const lines: string[] = [];
  let offset = 0;
  while (offset < normalized.length && lines.length < maxLines) {
    const remaining = normalized.slice(offset);
    if (remaining.length <= maxUnits) {
      lines.push(remaining);
      offset = normalized.length;
      break;
    }
    let end = offset + maxUnits;
    const lastSpace = normalized.lastIndexOf(" ", end);
    if (lastSpace > offset + Math.floor(maxUnits / 2)) {
      end = lastSpace;
    }
    lines.push(normalized.slice(offset, end).trim());
    offset = end;
    while (normalized[offset] === " ") {
      offset += 1;
    }
  }
  if (offset < normalized.length && lines.length === maxLines) {
    const last = lines.length - 1;
    lines[last] = `${lines[last].slice(0, Math.max(1, maxUnits - 1)).trimEnd()}…`;
  }
  return lines.join("\n");
}

function shorten(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function extensionForMimeType(mimeType: string) {
  return mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
}

function hasExpectedImageSignature(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

function escapeFilterPath(value: string) {
  return value.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
