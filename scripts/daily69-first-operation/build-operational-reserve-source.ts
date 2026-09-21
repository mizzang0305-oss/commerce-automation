import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { validateCoupangAffiliateUrl } from "../../src/lib/affiliate-readiness";
import { atomicWriteJson } from "../../src/lib/queue-scheduler/atomicJson";
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

  const [sourceSnapshot, evidencePoolBytes] = await Promise.all([
    snapshotDirectoryFiles(sourceRoot),
    readFile(evidencePoolPath),
  ]);
  const queue = readSnapshotRequired<LocalQueueItem[]>(sourceSnapshot, "queue.json");
  const reserve = readSnapshotRequired<ReserveCandidate[]>(sourceSnapshot, "reserve-pool.json");
  const evidencePool = parseRequiredJson<ReserveCandidate[]>(evidencePoolBytes);
  const registry = validateUsageEvidenceRegistry(readSnapshotRequired<UsageEvidenceRegistry>(sourceSnapshot, "selected-registry.json"));
  const sourceProof = readSnapshotOptional<Record<string, unknown>>(sourceSnapshot, "source-proof.json", {});
  const finalSummary = readSnapshotOptional<Record<string, unknown>>(sourceSnapshot, "final-summary.json", {});
  const inheritedParentSourceNamespace = typeof sourceProof.parentSourceNamespace === "string" ? sourceProof.parentSourceNamespace.trim() : "";
  const parentSourceNamespace = inheritedParentSourceNamespace || basename(sourceRoot);
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(parentSourceNamespace)) throw new Error("OPERATIONAL_SOURCE_PARENT_NAMESPACE_INVALID");
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
    await Promise.all([...sourceSnapshot.entries()].map(([name, bytes]) => writeFile(join(staging, name), bytes, { flag: "wx" })));
    const evidenceFileSha256 = sha256(evidencePoolBytes);
    await Promise.all([
      atomicWriteJson(join(staging, "reserve-pool.json"), operationalReserve),
      atomicWriteJson(join(staging, "materialization-preflight.json"), materialization),
      atomicWriteJson(join(staging, "source-proof.json"), {
        ...sourceProof,
        sourceNamespace: basename(outputRoot),
        parentSourceNamespace,
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
        parentSourceNamespace,
        materializationEligibility: materialization,
        operationalReserveAffiliateReady: operationalReserve.length,
        SAFE_TO_UPLOAD: false,
        PLATFORM_UPLOAD: 0,
      }),
      atomicWriteJson(join(staging, "operational-reserve-affiliate-repair.json"), {
        schemaVersion: "daily69-operational-reserve-affiliate-repair-v1",
        sourceNamespace: basename(sourceRoot),
        parentSourceNamespace,
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
async function snapshotDirectoryFiles(root: string) {
  const entries = (await readdir(root, { withFileTypes: true })).filter((entry) => entry.isFile());
  return new Map(await Promise.all(entries.map(async (entry) => [entry.name, await readFile(join(root, entry.name))] as const)));
}
function readSnapshotRequired<T>(snapshot: Map<string, Buffer>, name: string) {
  const bytes = snapshot.get(name);
  if (!bytes) throw new Error("OPERATIONAL_SOURCE_FILE_MISSING");
  return parseRequiredJson<T>(bytes);
}
function readSnapshotOptional<T>(snapshot: Map<string, Buffer>, name: string, fallback: T) {
  const bytes = snapshot.get(name);
  return bytes ? parseRequiredJson<T>(bytes) : fallback;
}
function parseRequiredJson<T>(bytes: Buffer) {
  return JSON.parse(bytes.toString("utf8")) as T;
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
