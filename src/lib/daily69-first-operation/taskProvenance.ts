export const TASK_PROVENANCE_EVENT_IDS = [107, 100, 129, 200, 201, 102] as const;

export type TaskInvocationProvenance = "natural_scheduled" | "manual" | "diagnostic" | "retry" | "unknown";

export type SanitizedTaskSchedulerEvent = {
  eventRecordId: number;
  eventId: number;
  timeCreatedUtc: string;
  taskName: string;
  taskInstanceId: string;
  processId?: number;
  resultCode?: number;
};

export type TaskProvenanceResult = {
  classification: TaskInvocationProvenance;
  taskName: string;
  taskInstanceId: string;
  requiredEventIds: number[];
  observedEventIds: number[];
  missingEventIds: number[];
  duplicateEventIds: number[];
  resultCodesPass: boolean;
  reasons: string[];
};

export function classifyTaskInvocationProvenance(input: {
  taskName: string;
  events: SanitizedTaskSchedulerEvent[];
  declaredInvocationType?: "diagnostic" | "retry";
}): TaskProvenanceResult {
  const taskName = normalizeTaskName(input.taskName);
  const relevant = input.events.filter((event) => normalizeTaskName(event.taskName) === taskName);
  const observedEventIds = [...new Set(relevant.map((event) => event.eventId))].sort((left, right) => left - right);
  const requiredEventIds = [...TASK_PROVENANCE_EVENT_IDS];
  const missingEventIds = requiredEventIds.filter((eventId) => !observedEventIds.includes(eventId));
  const duplicateEventIds = observedEventIds.filter((eventId) => relevant.filter((event) => event.eventId === eventId).length > 1);
  const instanceIds = [...new Set(relevant.map((event) => event.taskInstanceId).filter(Boolean))];
  const taskInstanceId = instanceIds.length === 1 ? instanceIds[0] : "";
  const resultCodesPass = relevant
    .filter((event) => event.eventId === 201 || event.eventId === 102)
    .every((event) => event.resultCode === 0);
  const reasons: string[] = [];

  if (input.declaredInvocationType === "diagnostic" || input.declaredInvocationType === "retry") {
    reasons.push(`DECLARED_${input.declaredInvocationType.toUpperCase()}`);
    return result(input.declaredInvocationType, taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, reasons);
  }
  if (relevant.some((event) => event.eventId === 110)) {
    reasons.push("TASK_EVENT_USER_TRIGGERED");
    return result("manual", taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, reasons);
  }
  if (instanceIds.length !== 1) reasons.push(instanceIds.length === 0 ? "TASK_INSTANCE_ID_MISSING" : "TASK_INSTANCE_ID_AMBIGUOUS");
  if (missingEventIds.length > 0) reasons.push("TASK_EVENT_CHAIN_INCOMPLETE");
  if (duplicateEventIds.length > 0) reasons.push("TASK_EVENT_CHAIN_DUPLICATE");
  if (!resultCodesPass) reasons.push("TASK_EVENT_RESULT_NONZERO");
  if (relevant.length === 0) reasons.push("TASK_EVENTS_ABSENT");
  const natural = instanceIds.length === 1 && missingEventIds.length === 0 && duplicateEventIds.length === 0 && resultCodesPass;
  return result(natural ? "natural_scheduled" : "unknown", taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, reasons);
}

function result(
  classification: TaskInvocationProvenance,
  taskName: string,
  taskInstanceId: string,
  requiredEventIds: number[],
  observedEventIds: number[],
  missingEventIds: number[],
  duplicateEventIds: number[],
  resultCodesPass: boolean,
  reasons: string[],
): TaskProvenanceResult {
  return { classification, taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, reasons };
}

function normalizeTaskName(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("\\") ? trimmed : `\\${trimmed}`;
}
