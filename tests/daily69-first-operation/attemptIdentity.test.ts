import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertFirstOperationIdentity, firstOperationNamespace, parseFirstOperationNamespace } from "../../src/lib/daily69-first-operation/operationIdentity";
import { assertFirstOperationAttemptCutover } from "../../src/lib/daily69-first-operation/attemptCutover";
import type { FirstOperationManifest } from "../../src/lib/daily69-first-operation";
import { assertFreshAttemptCutover, projectionNamespaceRegistryEntry } from "../../src/lib/queue-control-integration/quarantine";

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))));
const operationDate = "2099-01-02";
const namespace = firstOperationNamespace(operationDate, 2);
const previousAttemptNamespace = firstOperationNamespace(operationDate, 1);
const target = { namespace, operationDate, attemptNumber: 2, previousAttemptNamespace };
const safety = { SAFE_TO_UPLOAD: false, SAFE_TO_PUBLIC_UPLOAD: false, PLATFORM_UPLOAD: 0, GOOGLE_DRIVE_WRITE: 0, PRODUCTION_DB_WRITE: 0, R2_WRITE: 0 };
const predecessor = { schemaVersion: "daily69-first-operation-v2", namespace: previousAttemptNamespace, operationDate, attemptNumber: 1, previousAttemptNamespace: "", armStatus: "held", expectedGitHead: "a".repeat(40), safety };

describe("canonical Daily69 operation attempts", () => {
  it("round-trips a date independently from the canonical attempt suffix", () => {
    expect(parseFirstOperationNamespace(previousAttemptNamespace)).toEqual({ namespace: previousAttemptNamespace, operationDate, attemptNumber: 1 });
    expect(assertFirstOperationIdentity(target)).toEqual({ namespace, operationDate, attemptNumber: 2 });
    expect(assertFirstOperationIdentity({ ...target, namespace: firstOperationNamespace(operationDate, 3), attemptNumber: 3, previousAttemptNamespace: namespace }).attemptNumber).toBe(3);
  });

  it.each(["operation-2099-01-02-attempt-1", "operation-2099-01-02-attempt-02", "operation-2099-01-02-attempt-0", "operation-2099-01-02-attempt--2", "operation-2099-01-02-attempt-2x", "operation-2099-01-02-attempt-9007199254740992", "operation-2099-02-30", "operation-2099-13-01", "../operation-2099-01-02", "operation-2099-01-02/child"])("rejects noncanonical namespace %s", (value) => {
    expect(parseFirstOperationNamespace(value)).toBeNull();
  });

  it("rejects wrong date, wrong explicit attempt, missing predecessor, and skipped/cross-date predecessor", () => {
    expect(() => assertFirstOperationIdentity({ ...target, operationDate: "2099-01-03" })).toThrow("FIRST_OPERATION_NAMESPACE_ATTEMPT_MISMATCH");
    expect(() => assertFirstOperationIdentity({ ...target, attemptNumber: 3 })).toThrow("FIRST_OPERATION_NAMESPACE_ATTEMPT_MISMATCH");
    expect(() => assertFirstOperationIdentity({ ...target, previousAttemptNamespace: "" })).toThrow("FIRST_OPERATION_PREVIOUS_ATTEMPT_INVALID");
    expect(() => assertFirstOperationIdentity({ ...target, previousAttemptNamespace: "operation-2099-01-01" })).toThrow("FIRST_OPERATION_PREVIOUS_ATTEMPT_INVALID");
    expect(() => assertFirstOperationIdentity({ ...target, namespace: firstOperationNamespace(operationDate, 3), attemptNumber: 3 })).toThrow("FIRST_OPERATION_PREVIOUS_ATTEMPT_INVALID");
  });

  it("admits a canonical held predecessor without relabeling valid history as quarantine", () => {
    const before = JSON.stringify(predecessor);
    expect(assertFreshAttemptCutover({ ...target, previousAttemptManifest: predecessor })).toMatchObject({ namespace: previousAttemptNamespace, localOperationDisposition: "held_attempt", sheetProjectionDisposition: "historical_valid" });
    expect(JSON.stringify(predecessor)).toBe(before);
    expect(projectionNamespaceRegistryEntry(previousAttemptNamespace)).toBeNull();
    expect(assertFreshAttemptCutover({ namespace: "operation-2026-08-17-attempt-2", operationDate: "2026-08-17", attemptNumber: 2, previousAttemptNamespace: "operation-2026-08-17" })).toMatchObject({ sheetProjectionDisposition: "quarantined_legacy_projection" });
  });

  it.each(["prepared", "projection_verified", "tasks_armed", "running", "closing", "closed_success", "closed_failed"])("rejects a predecessor that is %s instead of held", (armStatus) => {
    expect(() => assertFreshAttemptCutover({ ...target, previousAttemptManifest: { ...predecessor, armStatus } })).toThrow("CUTOVER_PREVIOUS_ATTEMPT_NOT_HELD");
  });

  it("rejects missing, cross-operation, malformed SHA, and unsafe predecessor evidence", () => {
    expect(() => assertFreshAttemptCutover(target)).toThrow("CUTOVER_PREVIOUS_ATTEMPT_NOT_QUARANTINED");
    expect(() => assertFreshAttemptCutover({ ...target, previousAttemptManifest: { ...predecessor, namespace: "operation-2099-01-03" } })).toThrow("CUTOVER_PREVIOUS_ATTEMPT_IDENTITY_INVALID");
    expect(() => assertFreshAttemptCutover({ ...target, previousAttemptManifest: { ...predecessor, expectedGitHead: "bad" } })).toThrow("CUTOVER_PREVIOUS_ATTEMPT_IDENTITY_INVALID");
    expect(() => assertFreshAttemptCutover({ ...target, previousAttemptManifest: { ...predecessor, safety: { ...safety, PLATFORM_UPLOAD: 1 } } })).toThrow("CUTOVER_PREVIOUS_ATTEMPT_SAFETY_INVALID");
  });

  it("reopens the same-base predecessor and notices a state change before append", async () => {
    const root = await temporaryRoot();
    const operationRoot = join(root, namespace);
    const predecessorRoot = join(root, previousAttemptNamespace);
    await mkdir(operationRoot); await mkdir(predecessorRoot);
    const path = join(predecessorRoot, "operation-manifest.json");
    await writeFile(path, JSON.stringify(predecessor));
    const before = await readFile(path, "utf8");
    await expect(assertFirstOperationAttemptCutover(operationRoot, target as FirstOperationManifest)).resolves.toMatchObject({ sheetProjectionDisposition: "historical_valid" });
    expect(await readFile(path, "utf8")).toBe(before);
    await writeFile(path, JSON.stringify({ ...predecessor, armStatus: "running" }));
    await expect(assertFirstOperationAttemptCutover(operationRoot, target as FirstOperationManifest)).rejects.toThrow("CUTOVER_PREVIOUS_ATTEMPT_NOT_HELD");
  });

  it("rejects missing or redirected predecessor roots", async () => {
    const root = await temporaryRoot();
    const operationRoot = join(root, namespace);
    await mkdir(operationRoot);
    await expect(assertFirstOperationAttemptCutover(operationRoot, target as FirstOperationManifest)).rejects.toThrow("CUTOVER_PREVIOUS_ATTEMPT_MANIFEST_MISSING");
    const external = await temporaryRoot();
    await symlink(external, join(root, previousAttemptNamespace), process.platform === "win32" ? "junction" : "dir");
    await expect(assertFirstOperationAttemptCutover(operationRoot, target as FirstOperationManifest)).rejects.toThrow("CUTOVER_PREVIOUS_ATTEMPT_ROOT_INVALID");
  });
});

async function temporaryRoot() { const root = await mkdtemp(join(tmpdir(), "daily69-attempt-identity-")); roots.push(root); return root; }
