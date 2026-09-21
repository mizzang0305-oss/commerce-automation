export type FirstOperationIdentity = {
  namespace: string;
  operationDate: string;
  attemptNumber: number;
};

export function isFirstOperationDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function firstOperationNamespace(operationDate: string, attemptNumber: number) {
  if (!isFirstOperationDate(operationDate)) throw new Error("FIRST_OPERATION_DATE_INVALID");
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) throw new Error("FIRST_OPERATION_ATTEMPT_INVALID");
  return attemptNumber === 1 ? `operation-${operationDate}` : `operation-${operationDate}-attempt-${attemptNumber}`;
}

export function parseFirstOperationNamespace(value: unknown): FirstOperationIdentity | null {
  if (typeof value !== "string") return null;
  const match = /^operation-(\d{4}-\d{2}-\d{2})(?:-attempt-([1-9]\d*))?$/u.exec(value);
  if (!match || !isFirstOperationDate(match[1])) return null;
  const attemptNumber = match[2] === undefined ? 1 : Number(match[2]);
  if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1 || (match[2] !== undefined && attemptNumber < 2)) return null;
  if (firstOperationNamespace(match[1], attemptNumber) !== value) return null;
  return { namespace: value, operationDate: match[1], attemptNumber };
}

export function assertFirstOperationIdentity(input: {
  namespace: unknown;
  operationDate: unknown;
  attemptNumber?: unknown;
  previousAttemptNamespace?: unknown;
}): FirstOperationIdentity {
  const identity = parseFirstOperationNamespace(input.namespace);
  if (!identity || identity.operationDate !== input.operationDate || identity.attemptNumber !== (input.attemptNumber ?? 1)) {
    throw new Error("FIRST_OPERATION_NAMESPACE_ATTEMPT_MISMATCH");
  }
  const expectedPrevious = identity.attemptNumber === 1 ? "" : firstOperationNamespace(identity.operationDate, identity.attemptNumber - 1);
  if ((input.previousAttemptNamespace ?? "") !== expectedPrevious) throw new Error("FIRST_OPERATION_PREVIOUS_ATTEMPT_INVALID");
  return identity;
}
