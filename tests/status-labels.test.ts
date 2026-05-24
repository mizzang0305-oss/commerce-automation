import { describe, expect, test } from "vitest";
import { getQueueStatusLabel, getWorkerJobStatusLabel, getWorkerJobTypeLabel } from "@/lib/statusLabels";

describe("status labels", () => {
  test("returns Korean queue status labels", () => {
    expect(getQueueStatusLabel("processing")).toBe("처리 중");
    expect(getQueueStatusLabel("video_ready")).toBe("영상 준비 완료");
    expect(getQueueStatusLabel("manual_review")).toBe("수동 검토");
  });

  test("returns Korean worker job status labels", () => {
    expect(getWorkerJobStatusLabel("retry_wait")).toBe("재시도 대기");
    expect(getWorkerJobStatusLabel("completed")).toBe("완료");
  });

  test("returns Korean worker job type labels", () => {
    expect(getWorkerJobTypeLabel("video_render")).toBe("영상 생성");
    expect(getWorkerJobTypeLabel("sheet_sync")).toBe("시트 동기화");
  });
});
