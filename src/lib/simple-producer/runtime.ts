import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { readConfiguredSimpleProducerConfig } from "@/lib/simple-producer/config";
import { runSimpleProducerOnce } from "@/lib/simple-producer/producer";
import { FileSimpleProducerStore } from "@/lib/simple-producer/state";
import type { SimpleProducerPipelineResult, SimpleProducerRunResult } from "@/lib/simple-producer/types";
import { FileYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/fileStore";
import type { YouTubePublicPublisherState } from "@/lib/youtube-public-publisher/publisher";
import type { ProductVisualReviewReceipt } from "@/lib/video-automation/productVisualReview";

type ConfiguredSimpleProducerRunResult = SimpleProducerRunResult | {
  status: "configuration_error";
  safeError: string;
  date: "";
  slot: null;
  productId: null;
  uploadJobId: null;
  channelKey: null;
  readyJobCreated: 0;
  videosInsertCalls: 0;
  searchCalls: 0;
  rawProductsFound: 0;
  eligibleProductsFound: 0;
};

export async function runConfiguredSimpleProducerOnce(input: {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  now?: Date;
} = {}): Promise<ConfiguredSimpleProducerRunResult> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const configResult = await readConfiguredSimpleProducerConfig({ cwd, env });
  if (!configResult.ok) return configurationError(configResult.safeError);
  const publisherStatePath = env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH?.trim() ?? "";
  if (!publisherStatePath || !isAbsolute(publisherStatePath)) return configurationError("YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH_NOT_ABSOLUTE");
  if (isPathInside(resolve(publisherStatePath), cwd)) return configurationError("YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH_INSIDE_REPOSITORY");
  const producerStore = new FileSimpleProducerStore(resolve(configResult.config.evidenceRoot, "simple-producer-state.json"));
  const publisherStore = new FileYouTubePublicPublisherStore<YouTubePublicPublisherState>(resolve(publisherStatePath), { jobs: [], ledger: [] });
  return runSimpleProducerOnce({
    config: configResult.config,
    producerStore,
    publisherStore,
    now: input.now,
    reviewPublicKey: env.PRODUCT_CONTENT_REVIEW_PUBLIC_KEY,
    executePipeline: (pipelineInput) => executeLivePipeline({ cwd, env, ...pipelineInput })
  });
}

async function executeLivePipeline(input: {
  cwd: string;
  env: Readonly<Record<string, string | undefined>>;
  runId: string;
  outputRoot: string;
  excludedProductIds: string[];
}): Promise<SimpleProducerPipelineResult> {
  const liveRoot = resolve(input.outputRoot, "live-product-video", input.runId);
  const child = await runChild({
    cwd: input.cwd,
    env: {
      ...input.env,
      LIVE_PRODUCT_VIDEO_RUN_ID: input.runId,
      LIVE_PRODUCT_VIDEO_TARGET_COUNT: "1",
      LIVE_PRODUCT_VIDEO_ALLOWED_USE_CASES: "vehicle_organization,laundry_drying",
      LIVE_PRODUCT_VIDEO_EXCLUDED_PRODUCT_IDS: JSON.stringify(input.excludedProductIds),
      LIVE_PRODUCT_VIDEO_OUTPUT_ROOT: input.outputRoot,
      VIDEO_AUTOMATION_OUTPUT_ROOT: input.outputRoot
    }
  });
  const summary = await readJson(joinPath(liveRoot, "final-summary.json"));
  const counts = {
    searchCalls: readNumber(summary?.apiCallCount),
    rawProductsFound: readNumber(summary?.rawCandidateCount),
    eligibleProductsFound: readNumber(summary?.eligibleCount)
  };
  const selected = Array.isArray(summary?.selected) ? summary.selected : [];
  const machineItems = Array.isArray(summary?.machineQaItems) ? summary.machineQaItems : [];
  const candidate = selected.length === 1 && isRecord(selected[0]) && isRecord(selected[0].candidate) ? selected[0].candidate : null;
  const machineItem = candidate && machineItems.find((entry) => isRecord(entry) && entry.productKey === candidate.productKey && entry.machineQaPassed === true);
  if (child.code !== 0 || !candidate || !isRecord(machineItem) || typeof machineItem.finalVideo !== "string" || !machineItem.finalVideo) {
    return { ok: false, safeError: readSafeError(summary) || child.safeError || "SIMPLE_PRODUCER_LIVE_PIPELINE_FAILED", ...counts, item: null };
  }
  if (typeof candidate.productKey !== "string" || typeof candidate.canonicalProductName !== "string" || typeof candidate.selectedAffiliateUrl !== "string" || !candidate.selectedAffiliateUrl || (candidate.useCase !== "vehicle_organization" && candidate.useCase !== "laundry_drying")) {
    return { ok: false, safeError: "SIMPLE_PRODUCER_OUTPUT_CONTRACT_INVALID", ...counts, item: null };
  }
  return {
    ok: true,
    safeError: "",
    ...counts,
    item: {
      productId: candidate.productKey,
      canonicalProductName: candidate.canonicalProductName,
      affiliateUrl: candidate.selectedAffiliateUrl,
      useCase: candidate.useCase,
      videoPath: machineItem.finalVideo,
      machineQaPassed: true,
      productVisualReview: isRecord(machineItem.productVisualReview)
        ? machineItem.productVisualReview as ProductVisualReviewReceipt
        : undefined
    }
  };
}

async function runChild(input: { cwd: string; env: Readonly<Record<string, string | undefined>> }) {
  return new Promise<{ code: number; safeError: string }>((resolvePromise) => {
    const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/live-product-video/run-live-product-video-v1.ts"], {
      cwd: input.cwd,
      env: { ...input.env } as NodeJS.ProcessEnv,
      stdio: "pipe",
      windowsHide: true
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => { if (stderr.length < 8_192) stderr += chunk.toString("utf8"); });
    child.once("error", () => resolvePromise({ code: 1, safeError: "SIMPLE_PRODUCER_CHILD_START_FAILED" }));
    child.once("close", (code: number | null) => resolvePromise({ code: code ?? 1, safeError: stderr.includes("LOCAL_PROCESS_TIMEOUT") ? "SIMPLE_PRODUCER_LIVE_PIPELINE_TIMEOUT" : "" }));
  });
}

async function readJson(path: string): Promise<Record<string, unknown> | null> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as unknown;
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function readSafeError(summary: Record<string, unknown> | null) {
  const blocker = summary && Array.isArray(summary.blockers) ? summary.blockers.find((value) => typeof value === "string") : "";
  return typeof blocker === "string" && /^[A-Z0-9_:-]+$/u.test(blocker) ? blocker : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function joinPath(...parts: string[]) {
  return resolve(parts[0], ...parts.slice(1));
}

function isPathInside(candidate: string, parent: string) {
  const pathRelative = relative(parent, candidate);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative));
}

function configurationError(safeError: string): ConfiguredSimpleProducerRunResult {
  return { status: "configuration_error", safeError, date: "", slot: null, productId: null, uploadJobId: null, channelKey: null, readyJobCreated: 0, videosInsertCalls: 0, searchCalls: 0, rawProductsFound: 0, eligibleProductsFound: 0 };
}
