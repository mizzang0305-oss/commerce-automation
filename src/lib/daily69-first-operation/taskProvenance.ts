export const TASK_PROVENANCE_EVENT_IDS = [107, 100, 129, 200, 201, 102] as const;

export type TaskInvocationProvenance = "natural_scheduled" | "natural_scheduled_terminal_failure" | "manual" | "diagnostic" | "retry" | "unknown";
export type TaskEventResultStatus = "RESULT_SUCCESS" | "RESULT_FAILURE" | "RESULT_NOT_APPLICABLE" | "RESULT_MISSING_UNEXPECTED";

type TaskSchedulerEventContract = {
  purpose: "scheduled_trigger" | "task_started" | "process_launched" | "action_started" | "action_completed" | "task_completed";
  taskInstanceId: "required" | "optional_when_pid_correlated";
  processId: "required" | "not_applicable";
  resultCode: "required_zero" | "optional_zero" | "not_applicable";
};

export const TASK_PROVENANCE_EVENT_CONTRACT: Record<(typeof TASK_PROVENANCE_EVENT_IDS)[number], TaskSchedulerEventContract> = {
  107: { purpose: "scheduled_trigger", taskInstanceId: "required", processId: "not_applicable", resultCode: "not_applicable" },
  100: { purpose: "task_started", taskInstanceId: "required", processId: "not_applicable", resultCode: "not_applicable" },
  129: { purpose: "process_launched", taskInstanceId: "optional_when_pid_correlated", processId: "required", resultCode: "not_applicable" },
  200: { purpose: "action_started", taskInstanceId: "required", processId: "required", resultCode: "not_applicable" },
  201: { purpose: "action_completed", taskInstanceId: "required", processId: "required", resultCode: "required_zero" },
  102: { purpose: "task_completed", taskInstanceId: "required", processId: "not_applicable", resultCode: "optional_zero" },
};

export type SanitizedTaskSchedulerEvent = {
  eventRecordId: number;
  eventId: number;
  timeCreatedUtc: string;
  taskName: string;
  taskInstanceId: string;
  processId?: number;
  resultCode?: number;
  principalSidSha256?: string;
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
  processIdsPass: boolean;
  instanceIdsPass: boolean;
  resultCodeStatuses: Array<{ eventId: number; status: TaskEventResultStatus }>;
  reasons: string[];
};

export function classifyTaskInvocationProvenance(input: {
  taskName: string;
  events: SanitizedTaskSchedulerEvent[];
  declaredInvocationType?: "diagnostic" | "retry";
}): TaskProvenanceResult {
  const taskName = normalizeTaskName(input.taskName);
  const relevant = input.events.filter((event) => normalizeTaskName(event.taskName) === taskName);
  const requiredEventIds = [...TASK_PROVENANCE_EVENT_IDS];
  const observedEventIds = [...new Set(relevant.map((event) => event.eventId).filter((eventId) => requiredEventIds.includes(eventId as (typeof TASK_PROVENANCE_EVENT_IDS)[number])))].sort((left, right) => left - right);
  const missingEventIds = requiredEventIds.filter((eventId) => !observedEventIds.includes(eventId));
  const duplicateEventIds = observedEventIds.filter((eventId) => relevant.filter((event) => event.eventId === eventId).length > 1);
  const instanceIds = [...new Set(relevant.map((event) => event.taskInstanceId).filter(Boolean))];
  const taskInstanceId = instanceIds.length === 1 ? instanceIds[0] : "";
  const resultCodeStatuses = ([201, 102] as const).map((eventId) => ({
    eventId,
    status: resultStatus(relevant.filter((event) => event.eventId === eventId), TASK_PROVENANCE_EVENT_CONTRACT[eventId].resultCode),
  }));
  const resultCodesPass = resultCodeStatuses.every(({ status }) => status === "RESULT_SUCCESS" || status === "RESULT_NOT_APPLICABLE");
  const processEvents = ([129, 200, 201] as const).map((eventId) => relevant.filter((event) => event.eventId === eventId));
  const processIds = processEvents.flat().map((event) => event.processId).filter((value): value is number => Number.isSafeInteger(value) && Number(value) > 0);
  const processIdsPass = processEvents.every((events) => events.length === 1 && Number.isSafeInteger(events[0].processId) && Number(events[0].processId) > 0)
    && new Set(processIds).size === 1;
  const instanceIdsPass = instanceIds.length === 1 && TASK_PROVENANCE_EVENT_IDS.every((eventId) => {
    const matches = relevant.filter((event) => event.eventId === eventId);
    if (matches.length !== 1) return false;
    const contract = TASK_PROVENANCE_EVENT_CONTRACT[eventId];
    return matches[0].taskInstanceId === taskInstanceId
      || (contract.taskInstanceId === "optional_when_pid_correlated" && matches[0].taskInstanceId === "");
  });
  const reasons: string[] = [];

  if (input.declaredInvocationType === "diagnostic" || input.declaredInvocationType === "retry") {
    reasons.push(`DECLARED_${input.declaredInvocationType.toUpperCase()}`);
    return result(input.declaredInvocationType, taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, processIdsPass, instanceIdsPass, resultCodeStatuses, reasons);
  }
  if (relevant.some((event) => event.eventId === 110)) {
    reasons.push("TASK_EVENT_USER_TRIGGERED");
    return result("manual", taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, processIdsPass, instanceIdsPass, resultCodeStatuses, reasons);
  }
  if (instanceIds.length !== 1) reasons.push(instanceIds.length === 0 ? "TASK_INSTANCE_ID_MISSING" : "TASK_INSTANCE_ID_AMBIGUOUS");
  else if (!instanceIdsPass) reasons.push("TASK_EVENT_INSTANCE_CORRELATION_FAILED");
  if (missingEventIds.length > 0) reasons.push("TASK_EVENT_CHAIN_INCOMPLETE");
  if (duplicateEventIds.length > 0) reasons.push("TASK_EVENT_CHAIN_DUPLICATE");
  if (!processIdsPass) reasons.push("TASK_EVENT_PROCESS_CORRELATION_FAILED");
  if (resultCodeStatuses.some(({ status }) => status === "RESULT_MISSING_UNEXPECTED")) reasons.push("TASK_EVENT_RESULT_MISSING");
  if (resultCodeStatuses.some(({ status }) => status === "RESULT_FAILURE")) reasons.push("TASK_EVENT_RESULT_NONZERO");
  if (relevant.length === 0) reasons.push("TASK_EVENTS_ABSENT");
  const exactChain = instanceIdsPass && missingEventIds.length === 0 && duplicateEventIds.length === 0 && processIdsPass;
  const resultMissing = resultCodeStatuses.some(({ status }) => status === "RESULT_MISSING_UNEXPECTED");
  const resultFailed = resultCodeStatuses.some(({ status }) => status === "RESULT_FAILURE");
  const classification = exactChain && resultCodesPass
    ? "natural_scheduled"
    : exactChain && !resultMissing && resultFailed
      ? "natural_scheduled_terminal_failure"
      : "unknown";
  return result(classification, taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, processIdsPass, instanceIdsPass, resultCodeStatuses, reasons);
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
  processIdsPass: boolean,
  instanceIdsPass: boolean,
  resultCodeStatuses: Array<{ eventId: number; status: TaskEventResultStatus }>,
  reasons: string[],
): TaskProvenanceResult {
  return { classification, taskName, taskInstanceId, requiredEventIds, observedEventIds, missingEventIds, duplicateEventIds, resultCodesPass, processIdsPass, instanceIdsPass, resultCodeStatuses, reasons };
}

function resultStatus(
  events: SanitizedTaskSchedulerEvent[],
  contract: TaskSchedulerEventContract["resultCode"],
): TaskEventResultStatus {
  if (events.length !== 1) return "RESULT_MISSING_UNEXPECTED";
  const resultCode = events[0].resultCode;
  if (contract === "not_applicable") return "RESULT_NOT_APPLICABLE";
  if (resultCode === 0) return "RESULT_SUCCESS";
  if (resultCode === undefined && contract === "optional_zero") return "RESULT_NOT_APPLICABLE";
  if (resultCode === undefined) return "RESULT_MISSING_UNEXPECTED";
  return "RESULT_FAILURE";
}

function normalizeTaskName(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith("\\") ? trimmed : `\\${trimmed}`;
}
