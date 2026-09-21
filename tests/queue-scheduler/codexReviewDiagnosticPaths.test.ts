import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import path, { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { assertDiagnosticIsolation, assertDiagnosticPath, pathIsInside } from "../../src/lib/queue-scheduler/codexReviewDiagnosticPaths";
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function fixture() { const root = await mkdtemp(join(tmpdir(), "codex-review-diagnostic-")); roots.push(root); return { root, request: { provenance: "diagnostic", operationNamespace: "diagnostic-test", diagnosticRoot: root, receiptRoot: join(root, "receipts-root"), finalReviewArtifact: join(root, "final.json"), videoPath: join(root, "video.mp4"), machineQaSourceArtifact: join(root, "machine.json"), productReferencePath: join(root, "product.jpg"), visualEvidenceBindingPath: join(root, "visual.json"), visualEvidencePaths: [join(root, "first.jpg")], usageEvidenceProvenance: { productKey: "product" } } }; }
describe("diagnostic filesystem boundary", () => {
  it("handles Windows drive, UNC, separator, prefix and case semantics", () => {
    expect(pathIsInside("C:\\repro", "c:\\REPRO\\a.json", path.win32)).toBe(true);
    for (const p of ["C:\\reproduction\\a", "D:\\repro\\a", "C:\\repro\\..\\canonical\\a", "C:\\repro"]) expect(pathIsInside("C:\\repro", p, path.win32)).toBe(false);
    expect(pathIsInside("\\\\host\\share\\repro", "\\\\host\\other\\repro\\a", path.win32)).toBe(false);
  });
  it("allows only diagnostic identities and in-root input/write paths", async () => {
    const f = await fixture();
    await expect(assertDiagnosticIsolation(f.request, join(f.root, "result.json"))).resolves.toBe(f.root);
    await expect(assertDiagnosticIsolation({ ...f.request, operationNamespace: "operation-2026-09-05-attempt-2" })).rejects.toThrow("IDENTITY_INVALID");
    await expect(assertDiagnosticIsolation({ ...f.request, diagnosticRoot: undefined })).rejects.toThrow("ROOT_REQUIRED");
    await expect(assertDiagnosticIsolation(f.request, join(f.root, "..", "result.json"))).rejects.toThrow("PATH_ESCAPE");
  });
  it("rejects a disguised diagnostic root inside a canonical operation before writing", async () => {
    const f = await fixture(); await writeFile(join(f.root, "operation-manifest.json"), '{"held":true}');
    const before = await readFile(join(f.root, "operation-manifest.json"));
    await expect(assertDiagnosticIsolation(f.request)).rejects.toThrow("OPERATION_ROOT_FORBIDDEN");
    expect(await readFile(join(f.root, "operation-manifest.json"))).toEqual(before);
  });
  it("rejects input overwrite and junction escapes", async () => {
    const f = await fixture(), outside = await fixture();
    await expect(assertDiagnosticIsolation({ ...f.request, finalReviewArtifact: f.request.videoPath })).rejects.toThrow("INPUT_OVERWRITE");
    await symlink(outside.root, join(f.root, "linked"), process.platform === "win32" ? "junction" : "dir");
    await expect(assertDiagnosticPath(f.root, join(f.root, "linked", "x.json"))).rejects.toThrow("SYMLINK");
  });
});
