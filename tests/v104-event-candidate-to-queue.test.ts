import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  buildV104EventCandidateToQueueReport,
  type V104EventCandidateToQueueReport
} from "../src/automation/eventCandidateQueueMaterializer";

const FORBIDDEN_REPORT_PATTERN =
  /https?:\/\/|"UC[A-Za-z0-9_-]{20,}"|Authorization|Bearer|HmacSHA256|client_secret|token=|secret=|signature=/i;

describe("v104 event candidate to queue no-upload", () => {
  test("converts the V103 selected first candidate to a manual_review queue item without writing in dry_run", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const report = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-09",
        materializationMode: "dry_run"
      });

      expect(report.version).toBe("v104");
      expect(report.mode).toBe("event_candidate_to_queue_no_upload");
      expect(report.FINAL_STATUS).toBe("SUCCESS_V104_EVENT_CANDIDATE_TO_QUEUE_READY_NO_UPLOAD");
      expect(report.materializationMode).toBe("dry_run");
      expect(report.selectedCandidateFound).toBe(true);
      expect(report.selectedChannelKey).toBe("father_jobs");
      expect(report.queueItemCreated).toBe(false);
      expect(report.queueItemAlreadyExists).toBe(false);
      expect(report.queueWritePlanned).toBe(true);
      expect(report.localQueueWrite).toBe(false);
      expect(report.plannedQueueItem).toMatchObject({
        channelKey: "father_jobs",
        queue_rank: 1,
        upload_slot: 1,
        queue_status: "manual_review",
        manual_review_status: "not_ready",
        youtube_upload_status: "not_ready"
      });
      expect(report.plannedQueueItem?.rawUrlPresent).toBe(false);
      expect(report.plannedQueueItem?.affiliateUrlPresent).toBe(false);
      expect(report.v102AfterMaterialization).toMatchObject({
        executed: true,
        selectedItemFound: true,
        FINAL_STATUS: "BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD",
        currentBlocker: "BLOCKED_FIRST_VIDEO_SETTINGS_NOT_READY_NO_UPLOAD"
      });
      expectNoSideEffects(report);
      await expect(readFile(path.join(tempRoot, "data", "queue.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("local_write writes only the local queue file and lets standalone V102 see the candidate", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const report = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-09",
        materializationMode: "local_write"
      });

      expect(report.FINAL_STATUS).toBe("SUCCESS_V104_EVENT_CANDIDATE_TO_QUEUE_READY_NO_UPLOAD");
      expect(report.queueItemCreated).toBe(true);
      expect(report.queueItemAlreadyExists).toBe(false);
      expect(report.localQueueWrite).toBe(true);
      expect(report.DB_write).toBe(false);
      expect(report.Supabase_write).toBe(false);
      expect(report.v102AfterMaterialization).toMatchObject({
        executed: true,
        selectedItemFound: true
      });
      expect(report.v102AfterMaterialization?.FINAL_STATUS).not.toBe("BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD");
      expectNoSideEffects(report);

      const queue = JSON.parse(await readFile(path.join(tempRoot, "data", "queue.json"), "utf8")) as Array<Record<string, unknown>>;
      expect(queue).toHaveLength(1);
      expect(queue[0]).toMatchObject({
        channelKey: "father_jobs",
        queue_status: "manual_review",
        manual_review_status: "not_ready",
        raw_coupang_url: "",
        selected_affiliate_url: ""
      });
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("local_write is idempotent for the same channel event theme and queue date", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const first = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-09",
        materializationMode: "local_write"
      });
      const second = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-09",
        materializationMode: "local_write"
      });

      expect(first.queueItemCreated).toBe(true);
      expect(second.queueItemCreated).toBe(false);
      expect(second.queueItemAlreadyExists).toBe(true);
      expect(second.duplicateGuard.duplicateDetected).toBe(true);
      expect(second.duplicateGuard.duplicatePrevented).toBe(true);

      const queue = JSON.parse(await readFile(path.join(tempRoot, "data", "queue.json"), "utf8")) as unknown[];
      expect(queue).toHaveLength(1);
      expectNoSideEffects(second);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("local_write creates date-unique ids while preserving same-date duplicate prevention", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const firstDate = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-10",
        materializationMode: "local_write"
      });
      const secondDate = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-11",
        materializationMode: "local_write"
      });
      const secondDateRepeat = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-11",
        materializationMode: "local_write"
      });

      expect(firstDate.selectedEvent).toBe(secondDate.selectedEvent);
      expect(firstDate.selectedTheme).toBe(secondDate.selectedTheme);
      expect(firstDate.queueItemCreated).toBe(true);
      expect(secondDate.queueItemCreated).toBe(true);
      expect(secondDate.queueItemAlreadyExists).toBe(false);
      expect(secondDate.duplicateGuard.duplicateDetected).toBe(false);
      expect(secondDateRepeat.queueItemCreated).toBe(false);
      expect(secondDateRepeat.queueItemAlreadyExists).toBe(true);
      expect(secondDateRepeat.duplicateGuard.duplicateDetected).toBe(true);
      expect(secondDateRepeat.duplicateGuard.duplicatePrevented).toBe(true);
      expect(firstDate.queueItemShortId).not.toBe(secondDate.queueItemShortId);
      expect(secondDate.queueItemShortId).toBe(secondDateRepeat.queueItemShortId);
      expect(secondDate.v102AfterMaterialization).toMatchObject({
        executed: true,
        selectedItemFound: true
      });
      expect(secondDate.v102AfterMaterialization?.FINAL_STATUS).not.toBe("BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD");

      const queue = JSON.parse(await readFile(path.join(tempRoot, "data", "queue.json"), "utf8")) as Array<Record<string, unknown>>;
      expect(queue).toHaveLength(2);
      expect(new Set(queue.map((item) => item.id)).size).toBe(2);
      expect(queue.map((item) => item.queue_date).sort()).toEqual(["2026-07-10", "2026-07-11"]);
      expectNoSideEffects(secondDate);
      expectNoSideEffects(secondDateRepeat);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("local_write reports different short ids for 2026-07-09 and 2026-07-10 candidates", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const july9 = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-09",
        materializationMode: "local_write"
      });
      const july10 = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-10",
        materializationMode: "local_write"
      });

      expect(july9.queueItemCreated).toBe(true);
      expect(july10.queueItemCreated).toBe(true);
      expect(july9.queueItemShortId).not.toBe(july10.queueItemShortId);
      expectNoSideEffects(july9);
      expectNoSideEffects(july10);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("supabase_write is fail-closed and does not create a local queue item", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const report = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2026-07-09",
        materializationMode: "supabase_write"
      });

      expect(report.FINAL_STATUS).toBe("BLOCKED_SUPABASE_WRITE_NOT_APPROVED_NO_UPLOAD");
      expect(report.currentBlocker).toBe("BLOCKED_SUPABASE_WRITE_NOT_APPROVED_NO_UPLOAD");
      expect(report.queueItemCreated).toBe(false);
      expect(report.localQueueWrite).toBe(false);
      expect(report.DB_write).toBe(false);
      expect(report.Supabase_write).toBe(false);
      expect(report.v102AfterMaterialization?.selectedItemFound).toBe(true);
      expectNoSideEffects(report);
      await expect(readFile(path.join(tempRoot, "data", "queue.json"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });

  test("reports a precise blocker when V103 has no selected candidate", async () => {
    const tempRoot = await makeTempRoot();
    try {
      const report = await buildV104EventCandidateToQueueReport({
        cwd: tempRoot,
        today: "2030-01-01",
        materializationMode: "local_write"
      });

      expect(report.FINAL_STATUS).toBe("BLOCKED_V104_NO_SELECTED_CANDIDATE_NO_UPLOAD");
      expect(report.currentBlocker).toBe("BLOCKED_V104_NO_SELECTED_CANDIDATE_NO_UPLOAD");
      expect(report.selectedCandidateFound).toBe(false);
      expect(report.queueItemCreated).toBe(false);
      expect(report.v102AfterMaterialization).toMatchObject({
        executed: true,
        selectedItemFound: false,
        FINAL_STATUS: "BLOCKED_NO_FIRST_VIDEO_CANDIDATE_NO_UPLOAD"
      });
      expectNoSideEffects(report);
    } finally {
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});

async function makeTempRoot() {
  return mkdtemp(path.join(tmpdir(), "v104-event-candidate-to-queue-"));
}

function expectNoSideEffects(report: V104EventCandidateToQueueReport) {
  expect(report.DB_write).toBe(false);
  expect(report.Supabase_write).toBe(false);
  expect(report.n8nWebhookCalled).toBe(false);
  expect(report.schedulerExecutionCalled).toBe(false);
  expect(report.videosInsertCalled).toBe(false);
  expect(report.videosInsertTotalCount).toBe(0);
  expect(report.commentThreadsInsertCalled).toBe(false);
  expect(report.raw_urls_printed).toBe(false);
  expect(report.raw_video_ids_printed).toBe(false);
  expect(report.raw_channel_ids_printed).toBe(false);
  expect(report.secrets_printed).toBe(false);
  expect(report.fake_success).toBe(false);
  expect(report.SAFE_TO_UPLOAD).toBe(false);
  expect(report.SAFE_TO_PUBLIC_UPLOAD).toBe(false);
  expect(JSON.stringify(report)).not.toMatch(FORBIDDEN_REPORT_PATTERN);
}
