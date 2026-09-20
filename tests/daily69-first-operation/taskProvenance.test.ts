import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyTaskInvocationProvenance, type SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";

const taskName = "Minz-Commerce-VideoBatch-NoUpload-V1";
const instance = "{00000000-0000-0000-0000-000000000001}";
const processId = 4242;

function events(ids: number[], actionResultCode = 0): SanitizedTaskSchedulerEvent[] {
  return ids.map((eventId, index) => ({
    eventRecordId: 100 + index,
    eventId,
    timeCreatedUtc: new Date(Date.UTC(2026, 7, 30, 19, 0, index)).toISOString(),
    taskName,
    taskInstanceId: instance,
    ...([129, 200, 201].includes(eventId) ? { processId } : {}),
    ...(eventId === 201 ? { resultCode: actionResultCode } : {}),
  }));
}

function completeEvents() {
  return events([107, 100, 129, 200, 201, 102]);
}

describe("Daily69 Task Scheduler provenance", () => {
  it("replays the sanitized real automatic canary with Event 102 result not applicable", () => {
    const fixture = JSON.parse(readFileSync(
      join(process.cwd(), "tests", "daily69-first-operation", "fixtures", "task-scheduler-natural-canary-v1.json"),
      "utf8",
    )) as { taskName: string; events: SanitizedTaskSchedulerEvent[] };
    expect(classifyTaskInvocationProvenance({ taskName: fixture.taskName, events: fixture.events })).toMatchObject({
      classification: "natural_scheduled",
      taskInstanceId: "{dcfacf74-b60f-4e93-a607-f5e41b831901}",
      missingEventIds: [],
      duplicateEventIds: [],
      resultCodesPass: true,
      processIdsPass: true,
      instanceIdsPass: true,
      resultCodeStatuses: [
        { eventId: 201, status: "RESULT_SUCCESS" },
        { eventId: 102, status: "RESULT_NOT_APPLICABLE" },
      ],
    });
  });

  it("requires the complete scheduled event chain, one instance, and one correlated action PID", () => {
    expect(classifyTaskInvocationProvenance({ taskName, events: completeEvents() })).toMatchObject({
      classification: "natural_scheduled",
      taskInstanceId: instance,
      missingEventIds: [],
      duplicateEventIds: [],
      resultCodesPass: true,
      processIdsPass: true,
      instanceIdsPass: true,
    });
  });

  it("allows Event 102 without ResultCode or with explicit zero, but rejects an explicit failure", () => {
    const explicitZero = completeEvents().map((event) => event.eventId === 102 ? { ...event, resultCode: 0 } : event);
    const explicitFailure = completeEvents().map((event) => event.eventId === 102 ? { ...event, resultCode: 1 } : event);
    expect(classifyTaskInvocationProvenance({ taskName, events: completeEvents() }).classification).toBe("natural_scheduled");
    expect(classifyTaskInvocationProvenance({ taskName, events: explicitZero }).classification).toBe("natural_scheduled");
    expect(classifyTaskInvocationProvenance({ taskName, events: explicitFailure })).toMatchObject({
      classification: "natural_scheduled_terminal_failure",
      resultCodesPass: false,
      reasons: ["TASK_EVENT_RESULT_NONZERO"],
    });
  });

  it("fails closed when Event 201 is absent, missing its required result, or reports nonzero", () => {
    const missingEvent = completeEvents().filter((event) => event.eventId !== 201);
    const missingResult = completeEvents().map((event) => {
      if (event.eventId !== 201) return event;
      const withoutResultCode = { ...event };
      delete withoutResultCode.resultCode;
      return withoutResultCode;
    });
    expect(classifyTaskInvocationProvenance({ taskName, events: missingEvent }).classification).toBe("unknown");
    expect(classifyTaskInvocationProvenance({ taskName, events: missingResult })).toMatchObject({
      classification: "unknown",
      resultCodesPass: false,
      reasons: expect.arrayContaining(["TASK_EVENT_RESULT_MISSING"]),
    });
    expect(classifyTaskInvocationProvenance({ taskName, events: events([107, 100, 129, 200, 201, 102], 1) })).toMatchObject({
      classification: "natural_scheduled_terminal_failure",
      reasons: expect.arrayContaining(["TASK_EVENT_RESULT_NONZERO"]),
    });
  });

  it("fails closed when Event 102 is absent", () => {
    expect(classifyTaskInvocationProvenance({
      taskName,
      events: completeEvents().filter((event) => event.eventId !== 102),
    })).toMatchObject({
      classification: "unknown",
      missingEventIds: [102],
      reasons: expect.arrayContaining(["TASK_EVENT_CHAIN_INCOMPLETE"]),
    });
  });

  it("classifies a user-triggered task as manual even when success events exist", () => {
    expect(classifyTaskInvocationProvenance({ taskName, events: events([110, 107, 100, 129, 200, 201, 102]) })).toMatchObject({
      classification: "manual",
      reasons: ["TASK_EVENT_USER_TRIGGERED"],
    });
  });

  it("rejects wrong PID, wrong task, duplicate events, and conflicting instances", () => {
    const wrongPid = completeEvents().map((event) => event.eventId === 200 ? { ...event, processId: 9898 } : event);
    const duplicate = [...completeEvents(), completeEvents().find((event) => event.eventId === 102)!];
    const conflicting = completeEvents().map((event) => event.eventId === 102
      ? { ...event, taskInstanceId: "{00000000-0000-0000-0000-000000000002}" }
      : event);
    expect(classifyTaskInvocationProvenance({ taskName, events: wrongPid })).toMatchObject({
      classification: "unknown",
      processIdsPass: false,
      reasons: expect.arrayContaining(["TASK_EVENT_PROCESS_CORRELATION_FAILED"]),
    });
    expect(classifyTaskInvocationProvenance({ taskName: "Other-Task", events: completeEvents() })).toMatchObject({
      classification: "unknown",
      reasons: expect.arrayContaining(["TASK_EVENTS_ABSENT"]),
    });
    expect(classifyTaskInvocationProvenance({ taskName, events: duplicate })).toMatchObject({
      classification: "unknown",
      duplicateEventIds: [102],
    });
    expect(classifyTaskInvocationProvenance({ taskName, events: conflicting })).toMatchObject({
      classification: "unknown",
      reasons: expect.arrayContaining(["TASK_INSTANCE_ID_AMBIGUOUS"]),
    });
  });

  it("never counts diagnostic or retry invocations as natural", () => {
    const complete = completeEvents();
    expect(classifyTaskInvocationProvenance({ taskName, events: complete, declaredInvocationType: "diagnostic" }).classification).toBe("diagnostic");
    expect(classifyTaskInvocationProvenance({ taskName, events: complete, declaredInvocationType: "retry" }).classification).toBe("retry");
  });
});
