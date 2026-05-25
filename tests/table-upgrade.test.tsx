import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { JobsTable } from "@/components/JobsTable";
import { QueueTable } from "@/components/QueueTable";
import { createQueueItemFixture } from "@/test/fixtures";
import type { WorkerJob } from "@/types/automation";

describe("TanStack table upgrades", () => {
  test("filters queue table by product search", () => {
    render(
      <QueueTable
        items={[
          createQueueItemFixture({ id: "queue-a", product_name: "Alpha Item" }),
          createQueueItemFixture({ id: "queue-b", product_name: "Beta Item" })
        ]}
      />
    );

    fireEvent.change(screen.getByPlaceholderText("상품명, 키워드, 오류 검색"), { target: { value: "Alpha" } });

    expect(screen.getByText("Alpha Item")).toBeInTheDocument();
    expect(screen.queryByText("Beta Item")).not.toBeInTheDocument();
  });

  test("filters jobs table by status", () => {
    render(
      <JobsTable
        jobs={[
          createWorkerJobFixture({ id: "job-ok", status: "completed" }),
          createWorkerJobFixture({ id: "job-retry", status: "retry_wait" })
        ]}
      />
    );

    fireEvent.change(screen.getByLabelText("상태"), { target: { value: "retry_wait" } });

    expect(screen.getByText("job-retry")).toBeInTheDocument();
    expect(screen.queryByText("job-ok")).not.toBeInTheDocument();
  });
});

function createWorkerJobFixture(overrides: Partial<WorkerJob> = {}): WorkerJob {
  return {
    id: "job-1",
    job_type: "video_render",
    status: "pending",
    product_queue_id: "queue-001",
    product_candidate_id: "",
    priority: 1,
    payload: {},
    result: {},
    claimed_by: "",
    claimed_at: "",
    heartbeat_at: "",
    error_message: "",
    retry_count: 0,
    max_retries: 3,
    created_at: "2026-05-25T00:00:00.000Z",
    started_at: "",
    finished_at: "",
    ...overrides
  };
}
