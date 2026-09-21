import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";

export const CODEX_VISUAL_EVIDENCE_ROLES = [
  "first_frame",
  "first_three_seconds_contact_sheet",
  "full_contact_sheet",
] as const;
export type CodexVisualEvidenceRole = typeof CODEX_VISUAL_EVIDENCE_ROLES[number];

export const CODEX_VISUAL_BINDING_SCHEMA_VERSION = "queue-codex-visual-evidence-binding-v1" as const;

export type CodexVisualEvidenceBinding = {
  schemaVersion: typeof CODEX_VISUAL_BINDING_SCHEMA_VERSION;
  productKey: string;
  derivation: "native_final_artifacts" | "ffmpeg_derived_from_immutable_video";
  sourceVideo: InspectedFile;
  productReference: InspectedFile & { identityType: "product_reference" };
  visualEvidence: Array<InspectedFile & { role: CodexVisualEvidenceRole }>;
  SAFE_TO_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};

type InspectedFile = { path: string; sha256: string; size: number };

export async function createCodexVisualEvidenceBinding(input: {
  productKey: string;
  videoPath: string;
  productReferencePath: string;
  visualEvidencePaths: string[];
  visualEvidenceRoles: readonly CodexVisualEvidenceRole[];
  derivation: CodexVisualEvidenceBinding["derivation"];
  outputPath: string;
}) {
  const binding = await inspectBindingInputs(input);
  const outputPath = resolve(input.outputPath);
  await mkdir(dirname(outputPath), { recursive: true });
  try {
    await access(outputPath);
    const existing = await readCodexVisualEvidenceBinding(outputPath);
    if (stableJson(existing.binding) !== stableJson(binding)) throw new Error("CODEX_REVIEW_VISUAL_BINDING_ALREADY_EXISTS");
    return existing;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await writeFile(outputPath, `${JSON.stringify(binding, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return { path: await realpath(outputPath), sha256: await sha256File(outputPath), binding };
}

export async function readCodexVisualEvidenceBinding(path: string) {
  const inspected = await inspectFile(path, "CODEX_REVIEW_VISUAL_BINDING_NOT_FOUND");
  let parsed: unknown;
  try { parsed = JSON.parse(await readFile(inspected.path, "utf8")); }
  catch { throw new Error("CODEX_REVIEW_VISUAL_BINDING_INVALID"); }
  if (!isVisualEvidenceBinding(parsed)) throw new Error("CODEX_REVIEW_VISUAL_BINDING_INVALID");
  return { ...inspected, binding: parsed as CodexVisualEvidenceBinding };
}

export async function assertCodexVisualEvidenceBinding(input: {
  binding: CodexVisualEvidenceBinding;
  productKey: string;
  video: InspectedFile;
  productReference: InspectedFile;
  visualEvidence: Array<InspectedFile & { role: CodexVisualEvidenceRole }>;
}) {
  const expected = await inspectBindingInputs({
    productKey: input.productKey,
    videoPath: input.video.path,
    productReferencePath: input.productReference.path,
    visualEvidencePaths: input.visualEvidence.map(({ path }) => path),
    visualEvidenceRoles: input.visualEvidence.map(({ role }) => role),
    derivation: input.binding.derivation,
    outputPath: "unused",
  });
  if (stableJson(input.binding) !== stableJson(expected)) throw new Error("CODEX_REVIEW_VISUAL_BINDING_MISMATCH");
}

async function inspectBindingInputs(input: {
  productKey: string;
  videoPath: string;
  productReferencePath: string;
  visualEvidencePaths: string[];
  visualEvidenceRoles: readonly CodexVisualEvidenceRole[];
  derivation: CodexVisualEvidenceBinding["derivation"];
  outputPath: string;
}): Promise<CodexVisualEvidenceBinding> {
  if (!input.productKey.trim()) throw new Error("CODEX_REVIEW_VISUAL_BINDING_INVALID");
  if (input.visualEvidencePaths.length !== 3 || input.visualEvidenceRoles.some((role, index) => role !== CODEX_VISUAL_EVIDENCE_ROLES[index])) throw new Error("CODEX_REVIEW_VISUAL_BINDING_INVALID");
  const [sourceVideo, productReference, ...visualFiles] = await Promise.all([
    inspectFile(input.videoPath, "CODEX_REVIEW_VIDEO_NOT_FOUND"),
    inspectFile(input.productReferencePath, "CODEX_REVIEW_PRODUCT_REFERENCE_NOT_FOUND"),
    ...input.visualEvidencePaths.map((path) => inspectFile(path, "CODEX_REVIEW_INPUT_VISUAL_EVIDENCE_NOT_FOUND")),
  ]);
  const visualEvidence = visualFiles.map((file, index) => ({ ...file, role: input.visualEvidenceRoles[index] }));
  const allPaths = [productReference.path, ...visualEvidence.map(({ path }) => path)].map((path) => process.platform === "win32" ? path.toLowerCase() : path);
  if (new Set(allPaths).size !== allPaths.length) throw new Error("CODEX_REVIEW_VISUAL_BINDING_DUPLICATE_PATH");
  const expectedNames = ["first-frame.jpg", "first-3-seconds-contact-sheet.jpg", "contact-sheet.jpg"];
  if (visualEvidence.some(({ path }, index) => basename(path).toLowerCase() !== expectedNames[index])) throw new Error("CODEX_REVIEW_VISUAL_BINDING_FILENAME_INVALID");
  const evidenceDirs = new Set(visualEvidence.map(({ path }) => resolve(dirname(path)).toLowerCase()));
  if (evidenceDirs.size !== 1) throw new Error("CODEX_REVIEW_VISUAL_BINDING_DIRECTORY_INVALID");
  if (input.derivation === "native_final_artifacts" && resolve(dirname(sourceVideo.path)).toLowerCase() !== [...evidenceDirs][0]) throw new Error("CODEX_REVIEW_VISUAL_BINDING_DIRECTORY_INVALID");
  return {
    schemaVersion: CODEX_VISUAL_BINDING_SCHEMA_VERSION,
    productKey: input.productKey,
    derivation: input.derivation,
    sourceVideo,
    productReference: { ...productReference, identityType: "product_reference" },
    visualEvidence,
    SAFE_TO_UPLOAD: false,
    PLATFORM_UPLOAD: 0,
  };
}

async function inspectFile(path: string, code: string): Promise<InspectedFile> {
  try {
    const canonical = await realpath(resolve(path));
    const metadata = await stat(canonical);
    if (!metadata.isFile() || metadata.size < 1) throw new Error(code);
    return { path: canonical, sha256: await sha256File(canonical), size: metadata.size };
  } catch (error) {
    if (error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)) throw error;
    throw new Error(code);
  }
}
async function sha256File(path: string) { return new Promise<string>((resolvePromise, reject) => { const hash = createHash("sha256"); const stream = createReadStream(path); stream.on("error", reject); stream.on("data", (chunk) => hash.update(chunk)); stream.on("end", () => resolvePromise(hash.digest("hex"))); }); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function isInspectedFile(value: unknown): value is InspectedFile & Record<string, unknown> {
  return isRecord(value) && typeof value.path === "string" && isSha256(value.sha256) && Number.isSafeInteger(value.size) && Number(value.size) > 0;
}
function isVisualEvidenceBinding(value: unknown): value is CodexVisualEvidenceBinding {
  if (!isRecord(value) || value.schemaVersion !== CODEX_VISUAL_BINDING_SCHEMA_VERSION
    || typeof value.productKey !== "string" || !value.productKey.trim()
    || (value.derivation !== "native_final_artifacts" && value.derivation !== "ffmpeg_derived_from_immutable_video")
    || value.SAFE_TO_UPLOAD !== false || value.PLATFORM_UPLOAD !== 0
    || !isInspectedFile(value.sourceVideo) || !isRecord(value.productReference)
    || !isInspectedFile(value.productReference) || value.productReference.identityType !== "product_reference"
    || !Array.isArray(value.visualEvidence) || value.visualEvidence.length !== CODEX_VISUAL_EVIDENCE_ROLES.length) return false;
  return value.visualEvidence.every((entry, index) => isInspectedFile(entry)
    && isRecord(entry) && entry.role === CODEX_VISUAL_EVIDENCE_ROLES[index]);
}
function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (isRecord(value)) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`).join(",")}}`; return JSON.stringify(value); }
