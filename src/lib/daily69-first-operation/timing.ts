import contract from "./timing-contract.json";

export const DAILY69_TIMING = Object.freeze(contract);

/** Strict rounding leaves positive clearance even when the bound is already rounded. */
export function getDaily69Timing(operationDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(operationDate)) throw new Error("FIRST_OPERATION_TIMING_DATE_INVALID");
  const start = Date.parse(`${operationDate}T00:00:00+09:00`);
  if (!Number.isFinite(start) || new Date(start + 9 * 3_600_000).toISOString().slice(0, 10) !== operationDate) throw new Error("FIRST_OPERATION_TIMING_DATE_INVALID");
  const c = DAILY69_TIMING;
  if (c.schemaVersion !== "daily69-task-timing-v1" || Object.entries(c).some(([key, value]) => key !== "schemaVersion" && (!Number.isInteger(value) || Number(value) <= 0))
    || c.lastBatchTriggerMinute !== 23 * 60 || c.batchExecutionLimitMinutes !== 55 || c.closeoutExecutionLimitMinutes !== 30
    || c.postBatchSafetyMarginMinutes < 15 || c.postCloseoutSafetyMarginMinutes < 15 || c.roundingMinutes > 15
    || c.idleGraceSeconds > 900 || c.idlePollSeconds > 30 || c.idlePollSeconds > c.idleGraceSeconds
    || c.idleGraceSeconds >= c.closeoutExecutionLimitMinutes * 60) throw new Error("FIRST_OPERATION_TIMING_CONTRACT_INVALID");
  const after = (minutes: number) => (Math.floor(minutes / c.roundingMinutes) + 1) * c.roundingMinutes;
  const batchDeadline = c.lastBatchTriggerMinute + c.batchExecutionLimitMinutes;
  const closeoutAt = after(batchDeadline + c.postBatchSafetyMarginMinutes);
  const closeoutDeadline = closeoutAt + c.closeoutExecutionLimitMinutes;
  const finalizerAt = after(closeoutDeadline + c.postCloseoutSafetyMarginMinutes);
  const at = (minutes: number) => new Date(start + minutes * 60_000);
  return { lastBatchAt: at(c.lastBatchTriggerMinute), batchDeadline: at(batchDeadline), closeoutAt: at(closeoutAt), closeoutDeadline: at(closeoutDeadline), finalizerAt: at(finalizerAt), finalizerDeadline: at(finalizerAt + c.finalizerExecutionLimitMinutes) };
}

export function isDaily69CloseoutWindow(operationDate: string, now: Date) {
  const timing = getDaily69Timing(operationDate);
  return now >= timing.closeoutAt && now < timing.closeoutDeadline;
}
