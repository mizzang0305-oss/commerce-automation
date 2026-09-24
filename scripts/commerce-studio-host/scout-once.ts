/** Explicit bounded candidate scout. Never renders, enqueues, or publishes. */
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { readConfiguredSimpleProducerConfig, isPathInside } from "../../src/lib/simple-producer/config";
import { FileSimpleProducerStore } from "../../src/lib/simple-producer/state";
import { scoutStudioCandidates } from "../../src/lib/commerce-studio/candidates/scout";
import type { YouTubePublicPublisherState } from "../../src/lib/youtube-public-publisher/publisher";

async function main() {
  if (process.env.STUDIO_CANDIDATE_SCOUT_ENABLED !== "true") throw new Error("STUDIO_SCOUT_NOT_ENABLED");
  const configured = await readConfiguredSimpleProducerConfig();
  if (!configured.ok) throw new Error(configured.safeError);
  const assetRoot = process.env.VIDEO_AUTOMATION_ASSET_ROOT || "";
  const publisherPath = process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH || "";
  if (!isAbsolute(assetRoot) || !isAbsolute(publisherPath) ||
      isPathInside(resolve(publisherPath), process.cwd())) throw new Error("STUDIO_SCOUT_CONFIG_INVALID");
  let publisher: YouTubePublicPublisherState;
  try { publisher = JSON.parse(await readFile(publisherPath, "utf8")) as YouTubePublicPublisherState; }
  catch { throw new Error("STUDIO_SCOUT_PUBLISHER_SOURCE_UNAVAILABLE"); }
  if (!Array.isArray(publisher.jobs) || !Array.isArray(publisher.ledger)) throw new Error("STUDIO_SCOUT_PUBLISHER_SOURCE_INVALID");
  const store = new FileSimpleProducerStore(resolve(configured.config.evidenceRoot, "simple-producer-state.json"));
  const result = await scoutStudioCandidates({ now: new Date(), config: configured.config,
    state: await store.read(), publisher, assetRoot });
  if (!result.ok) throw new Error(result.safeError || "STUDIO_SCOUT_FAILED");
  if (!result.cacheHit) await store.mutate((state) => {
    state.studioCandidates = result.candidates;
    state.studioCandidatesScoutedAt = new Date().toISOString();
  });
  console.log(JSON.stringify({ event: "studio_candidate_scout", result: result.cacheHit ? "CACHE_HIT" : "COMPLETE",
    searchCalls: result.searchCalls, rawProductsFound: result.rawProductsFound,
    eligibleCandidates: result.eligibleProductsFound, candidateRows: result.candidates.length,
    videosInsertCalls: 0 }));
}

void main().catch((error: unknown) => {
  const safeError = error instanceof Error && /^STUDIO_[A-Z0-9_]+$/u.test(error.message) ? error.message : "STUDIO_SCOUT_FAILED";
  console.error(JSON.stringify({ event: "studio_candidate_scout", safeError, videosInsertCalls: 0 }));
  process.exitCode = 2;
});
