import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, realpath, stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

type CodexUsageEvidenceProvenanceBase = {
  identityType: "generic_usage_example";
  productKey: string;
  exactProductUseClaimed: false;
};

export type CodexUsageEvidenceProvenance = CodexUsageEvidenceProvenanceBase & ({
  sourceType: "allocated_sanitized_scene_pack";
  useCase: string;
  packId: string;
  assetIds: string[];
  sequenceFingerprint: string;
  registrySha256: string;
  allocationSha256: string;
  rendererSpecSha256: string;
  sourceImageSha256s: string[];
  materializedUsagePath: string;
  materializedUsageSha256: string;
  materializationManifestPath: string;
  materializationManifestSha256: string;
} | {
  sourceType: "historical_machine_qa_attested_generic_usage";
  machineQaArtifactSha256: string;
  reviewedVideoSha256: string;
});

export async function assertCodexUsageEvidenceBinding(
  value: unknown,
  productKey: string,
  video: { sha256: string },
  machineQa: { sha256: string },
): Promise<void> {
  if (!isUsageEvidenceProvenance(value, productKey)) throw new Error("CODEX_REVIEW_USAGE_EVIDENCE_PROVENANCE_INVALID");
  if (value.sourceType === "historical_machine_qa_attested_generic_usage") {
    if (value.reviewedVideoSha256 !== video.sha256 || value.machineQaArtifactSha256 !== machineQa.sha256) throw new Error("CODEX_REVIEW_USAGE_EVIDENCE_PROVENANCE_MISMATCH");
    return;
  }
  const usage = await inspectFile(value.materializedUsagePath, "CODEX_REVIEW_USAGE_EVIDENCE_NOT_FOUND");
  const manifest = await inspectFile(value.materializationManifestPath, "CODEX_REVIEW_USAGE_EVIDENCE_MANIFEST_NOT_FOUND");
  if (usage.sha256 !== value.materializedUsageSha256 || manifest.sha256 !== value.materializationManifestSha256) throw new Error("CODEX_REVIEW_USAGE_EVIDENCE_PROVENANCE_MISMATCH");
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(manifest.path, "utf8")); } catch { throw new Error("CODEX_REVIEW_USAGE_EVIDENCE_MANIFEST_INVALID"); }
  if (!isRecord(parsed) || parsed.schemaVersion !== "allocated-usage-evidence-v1" || parsed.productKey !== value.productKey
    || parsed.useCase !== value.useCase || parsed.packId !== value.packId || parsed.sequenceFingerprint !== value.sequenceFingerprint
    || parsed.registrySha256 !== value.registrySha256 || parsed.allocationSha256 !== value.allocationSha256
    || parsed.rendererSpecSha256 !== value.rendererSpecSha256 || parsed.identityType !== "generic_usage_example"
    || !["CODEX_REVIEWED_LOCAL_ONLY", "HUMAN_AND_CODEX_REVIEWED_LOCAL_ONLY"].includes(String(parsed.reviewClass ?? ""))
    || parsed.ownerReviewStatus !== "pass" || parsed.noUploadAutomationEligible !== true || parsed.publishEligible !== false
    || parsed.SAFE_TO_UPLOAD !== false || !Array.isArray(parsed.assets) || parsed.assets.length !== 3
    || parsed.assets.some((entry, index) => !isRecord(entry) || entry.assetId !== value.assetIds[index]
      || entry.localImageSha256 !== value.sourceImageSha256s[index]) || !isRecord(parsed.output)
    || parsed.output.fileName !== basename(usage.path) || parsed.output.sha256 !== value.materializedUsageSha256
    || parsed.output.sizeBytes !== usage.size || parsed.output.videoCodec !== "h264" || parsed.output.width !== 1080
    || parsed.output.height !== 1920 || parsed.output.fps !== 30 || parsed.output.durationSeconds !== 9
    || parsed.output.audioStreamCount !== 0) throw new Error("CODEX_REVIEW_USAGE_EVIDENCE_MANIFEST_INVALID");
}

function isUsageEvidenceProvenance(value: unknown, productKey: string): value is CodexUsageEvidenceProvenance {
  if (!isRecord(value) || value.identityType !== "generic_usage_example" || value.productKey !== productKey || value.exactProductUseClaimed !== false) return false;
  if (value.sourceType === "historical_machine_qa_attested_generic_usage") return isSha256(value.machineQaArtifactSha256) && isSha256(value.reviewedVideoSha256);
  return value.sourceType === "allocated_sanitized_scene_pack" && typeof value.useCase === "string" && Boolean(value.useCase.trim())
    && typeof value.packId === "string" && Boolean(value.packId.trim()) && Array.isArray(value.assetIds)
    && value.assetIds.length === 3 && value.assetIds.every((entry) => typeof entry === "string") && new Set(value.assetIds).size === 3
    && typeof value.sequenceFingerprint === "string" && Boolean(value.sequenceFingerprint.trim())
    && Array.isArray(value.sourceImageSha256s) && value.sourceImageSha256s.length === 3 && value.sourceImageSha256s.every(isSha256)
    && isSha256(value.registrySha256) && isSha256(value.allocationSha256) && isSha256(value.rendererSpecSha256)
    && typeof value.materializedUsagePath === "string" && Boolean(value.materializedUsagePath)
    && isSha256(value.materializedUsageSha256) && typeof value.materializationManifestPath === "string"
    && Boolean(value.materializationManifestPath) && isSha256(value.materializationManifestSha256);
}

async function inspectFile(path: string, code: string) {
  try {
    const canonical = await realpath(resolve(path));
    const metadata = await stat(canonical);
    if (!metadata.isFile() || metadata.size < 1) throw new Error(code);
    return { path: canonical, size: metadata.size, sha256: await sha256File(canonical) };
  } catch (error) { if (error instanceof Error && error.message === code) throw error; throw new Error(code); }
}
async function sha256File(path: string) { return new Promise<string>((resolvePromise, reject) => { const hash = createHash("sha256"); const stream = createReadStream(path); stream.on("error", reject); stream.on("data", (chunk) => hash.update(chunk)); stream.on("end", () => resolvePromise(hash.digest("hex"))); }); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
