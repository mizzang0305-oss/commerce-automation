import { assertFirstOperationIdentity } from "@/lib/daily69-first-operation/operationIdentity";

export type ProjectionNamespaceDisposition =
  | "active"
  | "historical_valid"
  | "quarantined_legacy_projection"
  | "held_attempt";

export type ProjectionNamespaceRegistryEntry = {
  namespace: string;
  operationDate: string;
  attemptNumber: number;
  localOperationDisposition: ProjectionNamespaceDisposition;
  sheetProjectionDisposition: ProjectionNamespaceDisposition;
};

export const PROJECTION_NAMESPACE_REGISTRY: readonly ProjectionNamespaceRegistryEntry[] = [
  {
    namespace: "operation-2026-08-17",
    operationDate: "2026-08-17",
    attemptNumber: 1,
    localOperationDisposition: "held_attempt",
    sheetProjectionDisposition: "quarantined_legacy_projection",
  },
] as const;

export function projectionNamespaceRegistryEntry(namespace: string) {
  return PROJECTION_NAMESPACE_REGISTRY.find((entry) => entry.namespace === namespace) ?? null;
}

export function assertFreshAttemptCutover(input: {
  namespace: string;
  operationDate: string;
  attemptNumber: number;
  previousAttemptNamespace: string;
  previousAttemptManifest?: unknown;
}) {
  try { assertFirstOperationIdentity(input); } catch (error) {
    if (error instanceof Error && error.message === "FIRST_OPERATION_PREVIOUS_ATTEMPT_INVALID") throw new Error("CUTOVER_PREVIOUS_ATTEMPT_INVALID");
    throw new Error("CUTOVER_ATTEMPT_NAMESPACE_INVALID");
  }
  if (input.attemptNumber === 1) {
    if (input.previousAttemptNamespace) throw new Error("CUTOVER_PREVIOUS_ATTEMPT_INVALID");
    if (projectionNamespaceRegistryEntry(input.namespace)) throw new Error("CUTOVER_NAMESPACE_QUARANTINED");
    return null;
  }
  const previous = projectionNamespaceRegistryEntry(input.previousAttemptNamespace);
  if (previous) {
    if (previous.operationDate !== input.operationDate
      || previous.attemptNumber !== input.attemptNumber - 1
      || previous.localOperationDisposition !== "held_attempt"
      || previous.sheetProjectionDisposition !== "quarantined_legacy_projection") {
      throw new Error("CUTOVER_PREVIOUS_ATTEMPT_NOT_QUARANTINED");
    }
    return previous;
  }
  if (!input.previousAttemptManifest || typeof input.previousAttemptManifest !== "object" || Array.isArray(input.previousAttemptManifest)) {
    throw new Error("CUTOVER_PREVIOUS_ATTEMPT_NOT_QUARANTINED");
  }
  const manifest = input.previousAttemptManifest as Record<string, unknown>;
  try {
    assertFirstOperationIdentity({ namespace: manifest.namespace, operationDate: manifest.operationDate, attemptNumber: manifest.attemptNumber, previousAttemptNamespace: manifest.previousAttemptNamespace });
  } catch { throw new Error("CUTOVER_PREVIOUS_ATTEMPT_IDENTITY_INVALID"); }
  if (manifest.schemaVersion !== "daily69-first-operation-v2" || manifest.namespace !== input.previousAttemptNamespace
    || manifest.operationDate !== input.operationDate || (manifest.attemptNumber ?? 1) !== input.attemptNumber - 1
    || typeof manifest.expectedGitHead !== "string" || !/^[a-f0-9]{40}$/u.test(manifest.expectedGitHead)) {
    throw new Error("CUTOVER_PREVIOUS_ATTEMPT_IDENTITY_INVALID");
  }
  if (manifest.armStatus !== "held") throw new Error("CUTOVER_PREVIOUS_ATTEMPT_NOT_HELD");
  const safety = manifest.safety as Record<string, unknown> | undefined;
  if (!safety || safety.SAFE_TO_UPLOAD !== false || safety.SAFE_TO_PUBLIC_UPLOAD !== false
    || ["PLATFORM_UPLOAD", "GOOGLE_DRIVE_WRITE", "PRODUCTION_DB_WRITE", "R2_WRITE"].some((key) => safety[key] !== 0)) {
    throw new Error("CUTOVER_PREVIOUS_ATTEMPT_SAFETY_INVALID");
  }
  // A safely held modern operation is valid immutable history, not corrupt legacy projection.
  return {
    namespace: input.previousAttemptNamespace,
    operationDate: input.operationDate,
    attemptNumber: input.attemptNumber - 1,
    localOperationDisposition: "held_attempt",
    sheetProjectionDisposition: "historical_valid",
  } satisfies ProjectionNamespaceRegistryEntry;
}
