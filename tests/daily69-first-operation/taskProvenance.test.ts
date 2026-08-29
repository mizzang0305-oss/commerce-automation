import { describe, expect, it } from "vitest";
import { classifyTaskInvocationProvenance, type SanitizedTaskSchedulerEvent } from "../../src/lib/daily69-first-operation/taskProvenance";

const taskName = "Minz-Commerce-VideoBatch-NoUpload-V1";
const instance = "{00000000-0000-0000-0000-000000000001}";

function events(ids: number[], resultCode = 0): SanitizedTaskSchedulerEvent[] {
  return ids.map((eventId, index) => ({
    eventRecordId: 100 + index,
    eventId,
    timeCreatedUtc: new Date(Date.UTC(2026, 7, 30, 19, 0, index)).toISOString(),
    taskName,
    taskInstanceId: instance,
    resultCode: eventId === 201 || eventId === 102 ? resultCode : undefined,
  }));
}

describe("Daily69 Task Scheduler provenance", () => {
  it("requires the complete scheduled event chain with one task instance", () => {
    expect(classifyTaskInvocationProvenance({ taskName, events: events([107, 100, 129, 200, 201, 102]) })).toMatchObject({
      classification: "natural_scheduled",
      taskInstanceId: instance,
      missingEventIds: [],
      duplicateEventIds: [],
      resultCodesPass: true,
    });
  });

  it("classifies a user-triggered task as manual even when success events exist", () => {
    expect(classifyTaskInvocationProvenance({ taskName, events: events([110, 100, 129, 200, 201, 102]) })).toMatchObject({ classification: "manual" });
  });

  it("keeps incomplete, duplicate, ambiguous, and nonzero chains unknown", () => {
    expect(classifyTaskInvocationProvenance({ taskName, events: events([107, 100, 200, 201]) }).classification).toBe("unknown");
    expect(classifyTaskInvocationProvenance({ taskName, events: [...events([107, 100, 129, 200, 201, 102]), ...events([102])] }).classification).toBe("unknown");
    expect(classifyTaskInvocationProvenance({ taskName, events: events([107, 100, 129, 200, 201, 102], 1) }).classification).toBe("unknown");
  });

  it("never counts diagnostic or retry invocations as natural", () => {
    const complete = events([107, 100, 129, 200, 201, 102]);
    expect(classifyTaskInvocationProvenance({ taskName, events: complete, declaredInvocationType: "diagnostic" }).classification).toBe("diagnostic");
    expect(classifyTaskInvocationProvenance({ taskName, events: complete, declaredInvocationType: "retry" }).classification).toBe("retry");
  });
});
