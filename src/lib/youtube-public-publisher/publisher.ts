import {
  resolvePublisherChannel,
  type PublisherEnvironment,
  type YouTubePublicPublisherChannelKey
} from "@/lib/youtube-public-publisher/channelConfig";
import { verifyProductVisualReview, type ProductVisualReviewReceipt } from "@/lib/video-automation/productVisualReview";

export type YouTubePublicUploadJobStatus = "ready" | "uploading" | "uploaded" | "error" | "manual_review";

export type YouTubePublicUploadJob = {
  id: string;
  productId: string;
  channelKey: YouTubePublicPublisherChannelKey;
  videoPath: string;
  videoSha256: string;
  affiliateUrl: string;
  affiliateProductId: string;
  canonicalProductName: string;
  metadataProductName: string;
  title: string;
  description: string;
  disclosureText: string;
  machineQaStatus: "passed" | "failed" | "unknown";
  productVisualReview?: ProductVisualReviewReceipt;
  status: YouTubePublicUploadJobStatus;
  attemptCount: number;
  claimedAt: string;
  claimOwner: string;
  lastError: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type YouTubePublicUploadLedgerEntry = {
  channelKey: YouTubePublicPublisherChannelKey;
  channelId: string;
  productId: string;
  videoSha256: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  visibility: "public";
  publishedAt: string | null;
  recordedAt: string;
};

export type YouTubePublicPublisherState = {
  jobs: YouTubePublicUploadJob[];
  ledger: YouTubePublicUploadLedgerEntry[];
};

export interface YouTubePublicPublisherStore {
  read(): Promise<YouTubePublicPublisherState>;
  mutate<T>(operation: (state: YouTubePublicPublisherState) => T | Promise<T>): Promise<T>;
}

export type YouTubePublicPublisherClient = {
  getAccessToken(input: { channelKey: YouTubePublicPublisherChannelKey; tokenFilePath: string }): Promise<
    | { ok: true; accessToken: string }
    | { ok: false; safeError: string }
  >;
  probeMineChannel(input: { accessToken: string }): Promise<
    | { ok: true; channelId: string; channelTitle: string }
    | { ok: false; safeError: string }
  >;
  insertPublicVideo(input: {
    accessToken: string;
    videoPath: string;
    videoSha256: string;
    title: string;
    description: string;
  }): Promise<
    | { ok: true; youtubeVideoId: string }
    | { ok: false; safeError: string; retryable: boolean }
  >;
  readbackVideo(input: { accessToken: string; youtubeVideoId: string }): Promise<
    | { ok: true; channelId: string; privacyStatus: string; title: string; description: string }
    | { ok: false; safeError: string }
  >;
};

export type YouTubePublicPublisherRunResult = {
  status: "disabled" | "no_ready_job" | "retry_scheduled" | "uploaded" | "manual_review";
  jobId: string | null;
  safeError: string;
  videosInsertCalls: 0 | 1;
  canariesImported: number;
};

type RunOnceInput = {
  store: YouTubePublicPublisherStore;
  client: YouTubePublicPublisherClient;
  getVideoSha256: (videoPath: string) => Promise<string | null>;
  env?: PublisherEnvironment;
  now?: string;
  claimOwner: string;
};

type PublisherSettings = {
  enabled: boolean;
  maxDailyUploadsTotal: number;
  maxDailyUploadsPerChannel: number;
  maxAutoRetry: number;
};

const VERIFIED_CANARIES: ReadonlyArray<YouTubePublicUploadLedgerEntry> = [
  {
    channelKey: "neoman_moleulgeol",
    channelId: "UCOdvPLaFnvzAI-_VyIXTdOw",
    productId: "coupang:product:8722619857:item:25338476526:vendor:92333206506",
    videoSha256: "A018C0AF3E676568B4C6ADF72B8C7B27CB3D4F6169401AE7EB1D10C79502A6FB",
    youtubeVideoId: "t4F3OHxGGeg",
    youtubeUrl: "https://youtu.be/t4F3OHxGGeg",
    visibility: "public",
    publishedAt: null,
    recordedAt: "2026-09-21T00:00:00.000Z"
  },
  {
    channelKey: "father_jobs",
    channelId: "UC38rroV6ZRTIzqKgWr5vWrw",
    productId: "coupang:product:9143629055:item:26916966994:vendor:93885777552",
    videoSha256: "FDB233175C9B62FEB1A62D63A11DAF9E2FE533EB036C89F00B956A002F142104",
    youtubeVideoId: "f9zPg0OEqG8",
    youtubeUrl: "https://youtu.be/f9zPg0OEqG8",
    visibility: "public",
    publishedAt: null,
    recordedAt: "2026-09-21T00:00:00.000Z"
  }
];

export class InMemoryYouTubePublicPublisherStore implements YouTubePublicPublisherStore {
  private state: YouTubePublicPublisherState;
  private pending: Promise<void> = Promise.resolve();

  constructor(initial: YouTubePublicPublisherState) {
    this.state = clone(initial);
  }

  async read() {
    return clone(this.state);
  }

  async mutate<T>(operation: (state: YouTubePublicPublisherState) => T | Promise<T>) {
    const previous = this.pending;
    let release: (() => void) | undefined;
    this.pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await operation(this.state);
    } finally {
      release?.();
    }
  }

  snapshot() {
    return clone(this.state);
  }
}

export async function enqueueYouTubePublicUploadJob(
  store: YouTubePublicPublisherStore,
  job: YouTubePublicUploadJob
): Promise<{ created: boolean; safeError: string }> {
  return store.mutate((state) => {
    if (job.status !== "ready") {
      return { created: false, safeError: "YOUTUBE_PUBLIC_UPLOAD_JOB_NOT_READY" };
    }
    if (state.jobs.some((candidate) => candidate.id === job.id)) {
      return { created: false, safeError: "YOUTUBE_PUBLIC_UPLOAD_JOB_ID_EXISTS" };
    }
    if (hasDuplicateLedgerIdentity(state.ledger, job)) {
      return { created: false, safeError: "DUPLICATE_UPLOAD" };
    }
    if (state.jobs.some((candidate) => hasDuplicateLedgerIdentity([candidate], job))) {
      return { created: false, safeError: "DUPLICATE_UPLOAD_JOB" };
    }
    state.jobs.push(clone(job));
    return { created: true, safeError: "" };
  });
}

export async function runYouTubePublicPublisherOnce(input: RunOnceInput): Promise<YouTubePublicPublisherRunResult> {
  const now = input.now ?? new Date().toISOString();
  const settings = readSettings(input.env ?? process.env);
  const canariesImported = await importVerifiedCanaries(input.store);

  if (!settings.enabled) {
    return noMutationResult("disabled", "YOUTUBE_PUBLIC_PUBLISHER_DISABLED", canariesImported);
  }

  const claimed = await claimOneReadyJob({
    store: input.store,
    now,
    claimOwner: input.claimOwner,
    settings
  });
  if (claimed.kind === "none") {
    return noMutationResult("no_ready_job", "NO_READY_YOUTUBE_PUBLIC_UPLOAD_JOB", canariesImported);
  }
  if (claimed.kind === "blocked") {
    return {
      status: "manual_review",
      jobId: claimed.jobId,
      safeError: claimed.safeError,
      videosInsertCalls: 0,
      canariesImported
    };
  }

  const job = claimed.job;
  const validation = await validateJob(job, input.getVideoSha256, (input.env ?? process.env).PRODUCT_CONTENT_REVIEW_PUBLIC_KEY, (await input.store.read()).ledger.map((entry) => entry.youtubeVideoId));
  if (!validation.ok) {
    await moveToManualReview(input.store, job.id, input.claimOwner, validation.safeError, now);
    return { status: "manual_review", jobId: job.id, safeError: validation.safeError, videosInsertCalls: 0, canariesImported };
  }

  const route = resolvePublisherChannel(job.channelKey, input.env ?? process.env);
  if (!route.tokenFilePath) {
    await moveToManualReview(input.store, job.id, input.claimOwner, "CHANNEL_TOKEN_NOT_CONFIGURED", now);
    return { status: "manual_review", jobId: job.id, safeError: "CHANNEL_TOKEN_NOT_CONFIGURED", videosInsertCalls: 0, canariesImported };
  }

  const token = await input.client.getAccessToken({ channelKey: job.channelKey, tokenFilePath: route.tokenFilePath });
  if (!token.ok) {
    await moveToManualReview(input.store, job.id, input.claimOwner, token.safeError, now);
    return { status: "manual_review", jobId: job.id, safeError: token.safeError, videosInsertCalls: 0, canariesImported };
  }

  const identity = await input.client.probeMineChannel({ accessToken: token.accessToken });
  if (!identity.ok || identity.channelId !== route.expectedChannelId || identity.channelTitle !== route.expectedChannelTitle) {
    const safeError = !identity.ok ? identity.safeError : "CHANNEL_IDENTITY_MISMATCH";
    await moveToManualReview(input.store, job.id, input.claimOwner, safeError, now);
    return { status: "manual_review", jobId: job.id, safeError, videosInsertCalls: 0, canariesImported };
  }

  const attempt = await beginUploadAttempt(input.store, job.id, input.claimOwner, now, settings.maxAutoRetry);
  if (!attempt.ok) {
    return { status: "manual_review", jobId: job.id, safeError: attempt.safeError, videosInsertCalls: 0, canariesImported };
  }

  const upload = await input.client.insertPublicVideo({
    accessToken: token.accessToken,
    videoPath: job.videoPath,
    videoSha256: job.videoSha256,
    title: job.title,
    description: job.description
  });
  if (!upload.ok) {
    const retryScheduled = await scheduleRetryOrManualReview(
      input.store,
      job.id,
      input.claimOwner,
      upload.safeError,
      upload.retryable,
      now,
      settings.maxAutoRetry
    );
    return {
      status: retryScheduled ? "retry_scheduled" : "manual_review",
      jobId: job.id,
      safeError: upload.safeError,
      videosInsertCalls: 1,
      canariesImported
    };
  }

  const readback = await input.client.readbackVideo({ accessToken: token.accessToken, youtubeVideoId: upload.youtubeVideoId });
  if (!readback.ok || !matchesReadback(readback, job, route.expectedChannelId)) {
    const safeError = !readback.ok ? readback.safeError : "YOUTUBE_READBACK_MISMATCH";
    await moveToManualReview(input.store, job.id, input.claimOwner, safeError, now);
    return { status: "manual_review", jobId: job.id, safeError, videosInsertCalls: 1, canariesImported };
  }

  await completeUploadedJob(input.store, job, input.claimOwner, {
    channelId: readback.channelId,
    youtubeVideoId: upload.youtubeVideoId,
    now
  });
  return { status: "uploaded", jobId: job.id, safeError: "", videosInsertCalls: 1, canariesImported };
}

async function importVerifiedCanaries(store: YouTubePublicPublisherStore) {
  return store.mutate((state) => {
    let inserted = 0;
    for (const canary of VERIFIED_CANARIES) {
      if (!hasDuplicateLedgerIdentity(state.ledger, canary)) {
        state.ledger.push(clone(canary));
        inserted += 1;
      }
    }
    return inserted;
  });
}

async function claimOneReadyJob(input: {
  store: YouTubePublicPublisherStore;
  now: string;
  claimOwner: string;
  settings: PublisherSettings;
}): Promise<{ kind: "none" } | { kind: "blocked"; jobId: string; safeError: string } | { kind: "claimed"; job: YouTubePublicUploadJob }> {
  return input.store.mutate((state) => {
    const job = state.jobs
      .filter((candidate) => candidate.status === "ready")
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))[0];
    if (!job) {
      return { kind: "none" } as const;
    }

    if (hasDuplicateLedgerIdentity(state.ledger, job)) {
      setManualReview(job, "DUPLICATE_UPLOAD", input.now);
      return { kind: "blocked", jobId: job.id, safeError: "DUPLICATE_UPLOAD" } as const;
    }

    const dailyEntries = state.ledger.filter((entry) => entry.publishedAt && kstDate(entry.publishedAt) === kstDate(input.now));
    if (dailyEntries.length >= input.settings.maxDailyUploadsTotal) {
      setManualReview(job, "DAILY_UPLOAD_CAP_REACHED", input.now);
      return { kind: "blocked", jobId: job.id, safeError: "DAILY_UPLOAD_CAP_REACHED" } as const;
    }
    if (dailyEntries.filter((entry) => entry.channelKey === job.channelKey).length >= input.settings.maxDailyUploadsPerChannel) {
      setManualReview(job, "CHANNEL_DAILY_UPLOAD_CAP_REACHED", input.now);
      return { kind: "blocked", jobId: job.id, safeError: "CHANNEL_DAILY_UPLOAD_CAP_REACHED" } as const;
    }

    job.status = "uploading";
    job.claimOwner = input.claimOwner;
    job.claimedAt = input.now;
    job.updatedAt = input.now;
    return { kind: "claimed", job: clone(job) } as const;
  });
}

async function validateJob(job: YouTubePublicUploadJob, getVideoSha256: RunOnceInput["getVideoSha256"], reviewPublicKey: string | undefined, priorVideoIds: string[]) {
  if (!job.videoPath || !job.videoSha256) {
    return { ok: false as const, safeError: "VIDEO_ASSET_NOT_READY" };
  }
  const actualSha256 = await getVideoSha256(job.videoPath);
  if (!actualSha256 || !sameSha256(actualSha256, job.videoSha256)) {
    return { ok: false as const, safeError: "VIDEO_HASH_MISMATCH" };
  }
  if (job.machineQaStatus !== "passed") {
    return { ok: false as const, safeError: "MACHINE_QA_NOT_PASS" };
  }
  if (!job.canonicalProductName || job.canonicalProductName !== job.metadataProductName) {
    return { ok: false as const, safeError: "CANONICAL_PRODUCT_NAME_MISMATCH" };
  }
  if (!job.affiliateUrl || job.affiliateProductId !== job.productId) {
    return { ok: false as const, safeError: "AFFILIATE_PRODUCT_MISMATCH" };
  }
  if (!job.title || !job.description || !job.disclosureText || !job.description.includes(job.affiliateUrl) || !job.description.includes(job.disclosureText)) {
    return { ok: false as const, safeError: "METADATA_OR_DISCLOSURE_NOT_READY" };
  }
  const contentReview = verifyProductVisualReview({ receipt: job.productVisualReview, productId: job.productId, videoSha256: actualSha256, publicKey: reviewPublicKey, requiredPriorVideoIds: priorVideoIds });
  if (!contentReview.ok) return { ok: false as const, safeError: contentReview.safeError };
  return { ok: true as const };
}

async function beginUploadAttempt(
  store: YouTubePublicPublisherStore,
  jobId: string,
  claimOwner: string,
  now: string,
  maxAutoRetry: number
) {
  return store.mutate((state) => {
    const job = findClaimedJob(state, jobId, claimOwner);
    if (!job) {
      return { ok: false as const, safeError: "UPLOAD_CLAIM_LOST" };
    }
    if (job.attemptCount > maxAutoRetry) {
      setManualReview(job, "AUTO_RETRY_LIMIT_REACHED", now);
      return { ok: false as const, safeError: "AUTO_RETRY_LIMIT_REACHED" };
    }
    job.attemptCount += 1;
    job.updatedAt = now;
    return { ok: true as const };
  });
}

async function scheduleRetryOrManualReview(
  store: YouTubePublicPublisherStore,
  jobId: string,
  claimOwner: string,
  safeError: string,
  retryable: boolean,
  now: string,
  maxAutoRetry: number
) {
  return store.mutate((state) => {
    const job = findClaimedJob(state, jobId, claimOwner);
    if (!job) {
      return;
    }
    job.lastError = safeError;
    if (retryable && job.attemptCount <= maxAutoRetry) {
      job.status = "ready";
      job.claimOwner = "";
      job.claimedAt = "";
      job.updatedAt = now;
      return true;
    }
    setManualReview(job, safeError, now);
    return false;
  });
}

async function moveToManualReview(store: YouTubePublicPublisherStore, jobId: string, claimOwner: string, safeError: string, now: string) {
  return store.mutate((state) => {
    const job = findClaimedJob(state, jobId, claimOwner);
    if (job) {
      setManualReview(job, safeError, now);
    }
  });
}

async function completeUploadedJob(
  store: YouTubePublicPublisherStore,
  job: YouTubePublicUploadJob,
  claimOwner: string,
  input: { channelId: string; youtubeVideoId: string; now: string }
) {
  return store.mutate((state) => {
    const current = findClaimedJob(state, job.id, claimOwner);
    if (!current || hasDuplicateLedgerIdentity(state.ledger, job)) {
      return;
    }
    current.status = "uploaded";
    current.youtubeVideoId = input.youtubeVideoId;
    current.youtubeUrl = `https://www.youtube.com/watch?v=${input.youtubeVideoId}`;
    current.publishedAt = input.now;
    current.claimOwner = "";
    current.claimedAt = "";
    current.updatedAt = input.now;
    state.ledger.push({
      channelKey: current.channelKey,
      channelId: input.channelId,
      productId: current.productId,
      videoSha256: current.videoSha256,
      youtubeVideoId: input.youtubeVideoId,
      youtubeUrl: current.youtubeUrl,
      visibility: "public",
      publishedAt: input.now,
      recordedAt: input.now
    });
  });
}

function setManualReview(job: YouTubePublicUploadJob, safeError: string, now: string) {
  job.status = "manual_review";
  job.lastError = safeError;
  job.claimOwner = "";
  job.claimedAt = "";
  job.updatedAt = now;
}

function findClaimedJob(state: YouTubePublicPublisherState, jobId: string, claimOwner: string) {
  return state.jobs.find((job) => job.id === jobId && job.status === "uploading" && job.claimOwner === claimOwner) ?? null;
}

function hasDuplicateLedgerIdentity(
  ledger: ReadonlyArray<Pick<YouTubePublicUploadLedgerEntry, "channelKey" | "productId" | "videoSha256">>,
  candidate: Pick<YouTubePublicUploadLedgerEntry, "channelKey" | "productId" | "videoSha256">
) {
  return ledger.some((entry) =>
    entry.productId === candidate.productId || sameSha256(entry.videoSha256, candidate.videoSha256)
  );
}

function matchesReadback(
  readback: Extract<Awaited<ReturnType<YouTubePublicPublisherClient["readbackVideo"]>>, { ok: true }>,
  job: YouTubePublicUploadJob,
  expectedChannelId: string
) {
  return readback.channelId === expectedChannelId &&
    readback.privacyStatus === "public" &&
    readback.title === job.title &&
    readback.description.includes(job.affiliateUrl) &&
    readback.description.includes(job.disclosureText);
}

function readSettings(env: PublisherEnvironment): PublisherSettings {
  return {
    enabled: env.YOUTUBE_PUBLIC_PUBLISHER_ENABLED === "true",
    maxDailyUploadsTotal: readBoundedInteger(env.YOUTUBE_PUBLIC_PUBLISHER_MAX_DAILY_UPLOADS_TOTAL, 3, 3),
    maxDailyUploadsPerChannel: readBoundedInteger(env.YOUTUBE_PUBLIC_PUBLISHER_MAX_DAILY_UPLOADS_PER_CHANNEL, 2, 2),
    maxAutoRetry: readBoundedInteger(env.YOUTUBE_PUBLIC_PUBLISHER_MAX_AUTO_RETRY, 1, 1)
  };
}

function readBoundedInteger(value: string | undefined, fallback: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? Math.min(parsed, maximum) : fallback;
}

function noMutationResult(
  status: "disabled" | "no_ready_job",
  safeError: string,
  canariesImported: number
): YouTubePublicPublisherRunResult {
  return { status, jobId: null, safeError, videosInsertCalls: 0, canariesImported };
}

function sameSha256(left: string, right: string) {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function kstDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
