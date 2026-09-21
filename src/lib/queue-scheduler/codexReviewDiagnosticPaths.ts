import { lstat, realpath } from "node:fs/promises";
import path, { basename, dirname, isAbsolute, join, resolve } from "node:path";

type DiagnosticRequestPaths = {
  provenance: string; operationNamespace: string; diagnosticRoot?: string;
  receiptRoot: string; finalReviewArtifact: string; videoPath: string; machineQaSourceArtifact: string;
  productReferencePath: string; visualEvidenceBindingPath: string; visualEvidencePaths: string[];
  usageEvidenceProvenance: { productKey?: string; materializedUsagePath?: string; materializationManifestPath?: string };
};

export function pathIsInside(root: string, target: string, flavor: typeof path = path): boolean {
  const windows = flavor === path.win32 || (flavor === path && process.platform === "win32");
  const canonical = (p: string) => windows ? flavor.resolve(p).toLowerCase() : flavor.resolve(p);
  const rel = flavor.relative(canonical(root), canonical(target));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${flavor.sep}`) && !flavor.isAbsolute(rel);
}

export async function assertDiagnosticPath(root: string, target: string): Promise<void> {
  if (!isAbsolute(target) || !pathIsInside(root, target)) throw new Error("CODEX_REVIEW_DIAGNOSTIC_PATH_ESCAPE");
  let current = resolve(target);
  while (true) {
    try {
      const s = await lstat(current);
      if (s.isSymbolicLink()) throw new Error("CODEX_REVIEW_DIAGNOSTIC_SYMLINK");
      const canonical = await realpath(current);
      if (resolve(current).toLowerCase() !== canonical.toLowerCase()) throw new Error("CODEX_REVIEW_DIAGNOSTIC_SYMLINK");
      if (s.isFile() && s.nlink > 1) throw new Error("CODEX_REVIEW_DIAGNOSTIC_HARDLINK");
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    if (process.platform === "win32" ? current.toLowerCase() === resolve(root).toLowerCase() : current === resolve(root)) break;
    const parent = dirname(current); if (parent === current) throw new Error("CODEX_REVIEW_DIAGNOSTIC_PATH_ESCAPE"); current = parent;
  }
}

export async function assertDiagnosticIsolation(input: DiagnosticRequestPaths, outputPath?: string): Promise<string> {
  if (input.provenance !== "diagnostic") throw new Error("CODEX_REVIEW_DIAGNOSTIC_PROVENANCE_REQUIRED");
  if (!input.diagnosticRoot || !isAbsolute(input.diagnosticRoot)) throw new Error("CODEX_REVIEW_DIAGNOSTIC_ROOT_REQUIRED");
  const root = resolve(input.diagnosticRoot);
  if (!/^(daily69-codex-cli-repro|codex-review-diagnostic)-[A-Za-z0-9_-]+$/u.test(basename(root))
    || !/^diagnostic-[A-Za-z0-9_-]+$/u.test(input.operationNamespace)) throw new Error("CODEX_REVIEW_DIAGNOSTIC_IDENTITY_INVALID");
  // Existing operational markers in any ancestor make this an operational root,
  // regardless of a caller's diagnostic label or directory name.
  for (let p = root;; p = dirname(p)) {
    try { if ((await lstat(p)).isSymbolicLink()) throw new Error("CODEX_REVIEW_DIAGNOSTIC_SYMLINK"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    for (const name of ["operation-manifest.json", "queue-settings.json", "queue-items.json"]) {
      try { await lstat(join(p, name)); throw new Error("CODEX_REVIEW_DIAGNOSTIC_OPERATION_ROOT_FORBIDDEN"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
    if (dirname(p) === p) break;
  }
  const inputs = [input.videoPath, input.machineQaSourceArtifact, input.productReferencePath, input.visualEvidenceBindingPath,
    ...input.visualEvidencePaths, input.usageEvidenceProvenance.materializedUsagePath, input.usageEvidenceProvenance.materializationManifestPath].filter((p): p is string => typeof p === "string");
  const outputs = [input.receiptRoot, join(input.receiptRoot, "receipts"), join(input.receiptRoot, "attempts"), join(input.receiptRoot, "executor.lock"), input.finalReviewArtifact, ...(outputPath ? [outputPath] : [])];
  for (const p of [...inputs, ...outputs]) await assertDiagnosticPath(root, p);
  if (outputs.some(p => inputs.some(i => resolve(i).toLowerCase() === resolve(p).toLowerCase()))) throw new Error("CODEX_REVIEW_DIAGNOSTIC_INPUT_OVERWRITE");
  return root;
}
