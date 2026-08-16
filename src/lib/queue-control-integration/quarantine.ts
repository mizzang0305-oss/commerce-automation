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
}) {
  const canonical = input.attemptNumber === 1
    ? `operation-${input.operationDate}`
    : `operation-${input.operationDate}-attempt-${input.attemptNumber}`;
  if (input.namespace !== canonical || input.attemptNumber < 2) throw new Error("CUTOVER_ATTEMPT_NAMESPACE_INVALID");
  const previous = projectionNamespaceRegistryEntry(input.previousAttemptNamespace);
  if (!previous
    || previous.operationDate !== input.operationDate
    || previous.localOperationDisposition !== "held_attempt"
    || previous.sheetProjectionDisposition !== "quarantined_legacy_projection") {
    throw new Error("CUTOVER_PREVIOUS_ATTEMPT_NOT_QUARANTINED");
  }
  return previous;
}
