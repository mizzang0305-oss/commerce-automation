import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, readFile, readdir, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { validateCoupangAffiliateUrl } from "../../src/lib/affiliate-readiness";
import { atomicWriteJson, readJson } from "../../src/lib/queue-scheduler/atomicJson";
import type { LocalQueueItem, ReserveCandidate } from "../../src/lib/queue-scheduler/types";
import {
  preflightDaily69MaterializationEligibility,
  validateUsageEvidenceRegistry,
  type UsageEvidenceRegistry,
} from "../../src/lib/usage-evidence";

async function main() {
  const sourceRoot = await existingDirectory(requiredArg("--source-root"));
  const outputRoot = resolve(requiredArg("--output-root"));
  const evidencePoolPath = await existingFile(requiredArg("--affiliate-evidence-reserve-pool"));
  const assetRoot = await existingDirectory(requiredArg("--asset-root"));
  if (sourceRoot === outputRoot || !basename(outputRoot).startsWith("d69r-operational-")) {
    throw new Error("OPERATIONAL_SOURCE_OUTPUT_INVALID");
  }
  await assertContainedExistingParent(outputRoot);
  await assertAbsent(outputRoot);

  const [queue, reserve, evidencePool, registry, sourceProof, finalSummary] = await Promise.all([
    readRequired<LocalQueueItem[]>(join(sourceRoot, "queue.json")),
    readRequired<ReserveCandidate[]>(join(sourceRoot, "reserve-pool.json")),
    readRequired<ReserveCandidate[]>(evidencePoolPath),
    readRequired<UsageEvidenceRegistry>(join(sourceRoot, "selected-registry.json")).then(validateUsageEvidenceRegistry),
    readJson<Record<string, unknown>>(join(sourceRoot, "source-proof.json"), {}),
    readJson<Record<string, unknown>>(join(sourceRoot, "final-summary.json"), {}),
  ]);
  if (queue.length !== 69 || reserve.length < 14) throw new Error("OPERATIONAL_SOURCE_CARDINALITY_INVALID");

  const evidenceByProduct = new Map<string, ReserveCandidate>();
  for (const entry of evidencePool) {
    const key = entry.candidate.productKey;
    if (!key || evidenceByProduct.has(key)) throw new Error("AFFILIATE_EVIDENCE_PRODUCT_KEY_NOT_UNIQUE");
    evidenceByProduct.set(key, entry);
  }
  let repaired = 0;
  const operationalReserve = reserve.map((entry) => {
    if (validateCoupangAffiliateUrl(entry.candidate.selectedAffiliateUrl).affiliateReady) return structuredClone(entry);
    const evidence = evidenceByProduct.get(entry.candidate.productKey);
    if (!evidence || !sameProductIdentity(entry, evidence)) throw new Error("AFFILIATE_EVIDENCE_EXACT_PRODUCT_NOT_FOUND");
    if (!validateCoupangAffiliateUrl(evidence.candidate.selectedAffiliateUrl).affiliateReady) {
      throw new Error("AFFILIATE_EVIDENCE_NOT_READY");
    }
    repaired += 1;
    return {
      ...structuredClone(entry),
      candidate: { ...structuredClone(entry.candidate), selectedAffiliateUrl: evidence.candidate.selectedAffiliateUrl },
    };
  });

  const materialization = await preflightDaily69MaterializationEligibility({
    active: queue,
    reserve: operationalReserve,
    registry,
    assetRoot,
    requiredActive: 69,
    requiredReserve: 14,
  });
  if (!materialization.pass) throw new Error(materialization.safeCode);

  const staging = `${outputRoot}.staging-${process.pid}`;
  await assertAbsent(staging);
  try {
    await mkdir(staging, { recursive: false });
    const sourceFiles = (await readdir(sourceRoot, { withFileTypes: true })).filter((entry) => entry.isFile());
    await Promise.all(sourceFiles.map((entry) => copyFile(join(sourceRoot, entry.name), join(staging, entry.name), constants.COPYFILE_EXCL)));
    const evidenceFileSha256 = sha256(await readFile(evidencePoolPath));
    await Promise.all([
      atomicWriteJson(join(staging, "reserve-pool.json"), operationalReserve),
      atomicWriteJson(join(staging, "materialization-preflight.json"), materialization),
      atomicWriteJson(join(staging, "source-proof.json"), {
        ...sourceProof,
        sourceNamespace: basename(outputRoot),
        parentSourceNamespace: basename(sourceRoot),
        operationalReserveAffiliateContract: "exact-product-local-evidence-v1",
        affiliateEvidenceReservePoolSha256: evidenceFileSha256,
        operationalReserveAffiliateRepairs: repaired,
        materialization,
        sourceMutation: 0,
        SAFE_TO_UPLOAD: false,
        PLATFORM_UPLOAD: 0,
      }),
      atomicWriteJson(join(staging, "final-summary.json"), {
        ...finalSummary,
        sourceNamespace: basename(outputRoot),
        parentSourceNamespace: basename(sourceRoot),
        materializationEligibility: materialization,
        operationalReserveAffiliateReady: operationalReserve.length,
        SAFE_TO_UPLOAD: false,
        PLATFORM_UPLOAD: 0,
      }),
      atomicWriteJson(join(staging, "operational-reserve-affiliate-repair.json"), {
        schemaVersion: "daily69-operational-reserve-affiliate-repair-v1",
        sourceNamespace: basename(sourceRoot),
        outputNamespace: basename(outputRoot),
        evidenceFileSha256,
        exactProductIdentityFields: ["productKey", "rawProductId", "rawProductName"],
        reserveTotal: operationalReserve.length,
        reserveAffiliateReady: operationalReserve.filter((entry) => validateCoupangAffiliateUrl(entry.candidate.selectedAffiliateUrl).affiliateReady).length,
        repaired,
        productKeys: operationalReserve.map((entry) => entry.candidate.productKey),
        externalCalls: 0,
        sourceMutation: 0,
        SAFE_TO_UPLOAD: false,
        PLATFORM_UPLOAD: 0,
      }),
    ]);
    await rename(staging, outputRoot);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  process.stdout.write(`${JSON.stringify({ event: "daily69_operational_reserve_source_built", outputRoot, repaired, materialization, externalCalls: 0, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
}

function sameProductIdentity(left: ReserveCandidate, right: ReserveCandidate) {
  return left.candidate.productKey === right.candidate.productKey
    && left.candidate.rawProductId === right.candidate.rawProductId
    && left.candidate.rawProductName === right.candidate.rawProductName;
}
async function existingDirectory(value: string) {
  const path = await realpath(resolve(value));
  if (!(await stat(path)).isDirectory()) throw new Error("OPERATIONAL_SOURCE_DIRECTORY_REQUIRED");
  return path;
}
async function existingFile(value: string) {
  const path = await realpath(resolve(value));
  if (!(await stat(path)).isFile()) throw new Error("AFFILIATE_EVIDENCE_FILE_REQUIRED");
  return path;
}
async function assertContainedExistingParent(path: string) {
  const parent = await realpath(dirname(path));
  const fromParent = relative(parent, path);
  if (fromParent === ".." || fromParent.startsWith(`..${sep}`) || fromParent.includes(sep) || fromParent === "" || resolve(parent, fromParent) !== path) {
    throw new Error("OPERATIONAL_SOURCE_OUTPUT_INVALID");
  }
}
async function assertAbsent(path: string) {
  try { await stat(path); throw new Error("OPERATIONAL_SOURCE_OUTPUT_EXISTS"); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
async function readRequired<T>(path: string) {
  const value = await readJson<T | null>(path, null);
  if (value === null) throw new Error("OPERATIONAL_SOURCE_FILE_MISSING");
  return value;
}
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function requiredArg(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (!value) throw new Error(`MISSING_ARGUMENT_${name.replace(/^-+/u, "").toUpperCase()}`);
  return value;
}
function safeError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error);
  return /^[A-Z0-9_:-]+$/u.test(value) ? value : "OPERATIONAL_SOURCE_BUILD_FAILED";
}

void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "daily69_operational_reserve_source_build_failed", safeError: safeError(error), SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 })}\n`);
  process.exitCode = 1;
});
