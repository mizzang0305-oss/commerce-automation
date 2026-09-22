/** Explicit run-once exporter. No Task is installed or modified by this script. */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { readConfiguredSimpleProducerConfig, isPathInside } from "../../src/lib/simple-producer/config";
import { snapshotEnvelopeSchema, snapshotPayloadSchema, studioCandidateSchema, studioPlanSchema, type StudioSnapshot } from "../../src/lib/commerce-studio/bridge/contracts";
import { signStudioHostRequest } from "../../src/lib/commerce-studio/bridge/hostAuth";
import type { SimpleProducerState } from "../../src/lib/simple-producer/types";
import type { YouTubePublicPublisherState } from "../../src/lib/youtube-public-publisher/publisher";

type SequenceState = { sequence: number; pending: StudioSnapshot | null };

async function main() {
  const endpoint = process.env.STUDIO_BRIDGE_ORIGIN || "";
  const environmentId = process.env.STUDIO_ENVIRONMENT_ID || "";
  const ownerId = process.env.STUDIO_OWNER_GOOGLE_SUB || "";
  const hostId = process.env.STUDIO_HOST_ID || "";
  const secret = process.env.STUDIO_HOST_HMAC_SECRET || "";
  const runtimeSha = process.env.STUDIO_RUNTIME_SHA || "";
  const sequencePath = process.env.STUDIO_HOST_SEQUENCE_PATH || "";
  const publisherPath = process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH || "";
  if (!/^https:\/\/[^\s/]+$/u.test(endpoint) || !environmentId || !ownerId || !hostId ||
      secret.length < 32 || !/^[0-9a-f]{40}$/u.test(runtimeSha) || !isAbsolute(sequencePath) ||
      isPathInside(resolve(sequencePath), process.cwd()) || !isAbsolute(publisherPath)) throw new Error("STUDIO_EXPORT_CONFIG_INVALID");
  try {
    const actualSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8", timeout: 5000 }).trim();
    const changes = execFileSync("git", ["status", "--porcelain"], { cwd: process.cwd(), encoding: "utf8", timeout: 5000 }).trim();
    if (actualSha !== runtimeSha || changes) throw new Error("STUDIO_EXPORT_RUNTIME_SHA_MISMATCH");
  } catch { throw new Error("STUDIO_EXPORT_RUNTIME_SHA_MISMATCH"); }
  const configResult = await readConfiguredSimpleProducerConfig();
  if (!configResult.ok) throw new Error(configResult.safeError);
  await mkdir(dirname(sequencePath), { recursive: true });
  const lock = await open(`${sequencePath}.lock`, "wx");
  try {
    const state = await readSequence(sequencePath);
    const envelope = state.pending ?? await collectSnapshot({ environmentId, ownerId, hostId, runtimeSha,
      nextSequence: state.sequence + 1, producerEvidenceRoot: configResult.config.evidenceRoot,
      publisherPath, settings: configResult.config });
    if (!state.pending) await writeSequence(sequencePath, { sequence: state.sequence, pending: envelope });
    const body = JSON.stringify(envelope);
    const signed = signStudioHostRequest({ secret, hostId, method: "POST", pathname: "/api/studio-host/snapshot",
      timestamp: new Date().toISOString(), nonce: randomUUID(), body });
    const response = await fetch(`${endpoint}/api/studio-host/snapshot`, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(20_000),
      headers: { "Content-Type": "application/json", "x-studio-host-id": signed.hostId, "x-studio-timestamp": signed.timestamp,
        "x-studio-nonce": signed.nonce, "x-studio-signature": signed.signature }, body });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new Error("STUDIO_EXPORT_DELIVERY_NOT_ACKNOWLEDGED");
    const result = await response.json() as { status?: { status?: string } };
    if (!["accepted", "duplicate"].includes(result.status?.status || "")) throw new Error("STUDIO_EXPORT_DELIVERY_NOT_ACKNOWLEDGED");
    await writeSequence(sequencePath, { sequence: envelope.sourceSequence, pending: null });
    console.log(JSON.stringify({ event: "studio_export", status: result.status?.status, sourceSequence: envelope.sourceSequence }));
  } finally { await lock.close(); await rm(`${sequencePath}.lock`, { force: true }); }
}

async function collectSnapshot(input: { environmentId: string; ownerId: string; hostId: string; runtimeSha: string;
  nextSequence: number; producerEvidenceRoot: string; publisherPath: string;
  settings: { enabled: boolean; dailyGenerateTarget: number; maxItemsPerRun: 1; generationSlots: string[]; timeZone: "Asia/Seoul" } }): Promise<StudioSnapshot> {
  const producerRaw = await readOptionalJson<SimpleProducerState>(resolve(input.producerEvidenceRoot, "simple-producer-state.json"));
  const publisherRaw = await readOptionalJson<YouTubePublicPublisherState>(input.publisherPath);
  const producer = producerRaw && producerRaw.schema === "simple-producer/v1" && Array.isArray(producerRaw.slots) ? {
    settings: { enabled: input.settings.enabled, dailyGenerateTarget: input.settings.dailyGenerateTarget,
      maxItemsPerRun: input.settings.maxItemsPerRun, generationSlots: input.settings.generationSlots,
      timeZone: input.settings.timeZone, revision: producerRaw.studioSettingsRevision ?? 0 },
    slots: producerRaw.slots.map((slot) => ({ date: slot.date, slot: slot.slot, status: slot.status,
      createdAt: slot.createdAt, updatedAt: slot.updatedAt, productId: slot.productId,
      uploadJobId: slot.uploadJobId, safeError: slot.safeError }))
  } : null;
  const publisher = publisherRaw && Array.isArray(publisherRaw.jobs) && Array.isArray(publisherRaw.ledger) ? {
    jobs: publisherRaw.jobs.map((job) => ({ id: job.id, productId: job.productId, productName: job.canonicalProductName,
      channelKey: job.channelKey, status: job.status, createdAt: job.createdAt,
      publishedAt: job.publishedAt || null, youtubeVideoId: job.youtubeVideoId,
      youtubeUrl: job.youtubeUrl, title: job.title })),
    ledger: publisherRaw.ledger.map((item) => ({ youtubeVideoId: item.youtubeVideoId,
      productId: item.productId, channelKey: item.channelKey, channelId: item.channelId,
      visibility: item.visibility, recordedAt: item.recordedAt, publishedAt: item.publishedAt,
      youtubeUrl: item.youtubeUrl }))
  } : null;
  const plans = producerRaw?.studioPlans && Array.isArray(producerRaw.studioPlans) &&
    producerRaw.studioPlans.every((entry) => studioPlanSchema.safeParse(entry).success) ? producerRaw.studioPlans : null;
  const candidates = producerRaw?.studioCandidates && Array.isArray(producerRaw.studioCandidates) &&
    producerRaw.studioCandidates.every((entry) => studioCandidateSchema.safeParse(entry).success) ? producerRaw.studioCandidates : null;
  const payload = snapshotPayloadSchema.parse({ producer, publisher, plans, candidates });
  return snapshotEnvelopeSchema.parse({ schemaVersion: 1, environmentId: input.environmentId,
    ownerId: input.ownerId, hostId: input.hostId, sourceRuntimeSha: input.runtimeSha,
    sourceSequence: input.nextSequence, eventId: randomUUID(), observedAt: new Date().toISOString(),
    sourceRevision: createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
    completeness: { producer: producer !== null, publisher: publisher !== null, plans: plans !== null, candidates: candidates !== null },
    payload });
}

async function readOptionalJson<T>(path: string): Promise<T | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as T; }
  catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "ENOENT") return null;
    throw new Error("STUDIO_SOURCE_READ_FAILED");
  }
}
async function readSequence(path: string): Promise<SequenceState> {
  const value = await readOptionalJson<SequenceState>(path);
  if (!value) return { sequence: 0, pending: null };
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0 ||
      (value.pending && !snapshotEnvelopeSchema.safeParse(value.pending).success)) throw new Error("STUDIO_SEQUENCE_STATE_INVALID");
  return value;
}
async function writeSequence(path: string, state: SequenceState) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(JSON.stringify(state)); await handle.sync(); }
  finally { await handle.close(); }
  try { await rename(temporary, path); }
  finally { await rm(temporary, { force: true }).catch(() => undefined); }
}

void main().catch((error: unknown) => {
  const safeError = error instanceof Error && /^STUDIO_[A-Z0-9_]+$/u.test(error.message) ? error.message : "STUDIO_EXPORT_FAILED";
  console.error(JSON.stringify({ event: "studio_export", safeError }));
  process.exitCode = 2;
});
