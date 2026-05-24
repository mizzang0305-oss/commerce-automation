import { describe, expect, test } from "vitest";
import {
  getBooleanStatusLabel,
  getQueueStatusLabel,
  getRunModeLabel,
  getUploadStatusLabel,
  getWorkerJobStatusLabel,
  getWorkerJobTypeLabel
} from "@/lib/statusLabels";

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

  test("returns Korean run mode labels", () => {
    expect(getRunModeLabel("generate_only")).toBe("생성 전용");
  });

  test("returns Korean upload and boolean labels", () => {
    expect(getUploadStatusLabel("ready_to_upload")).toBe("업로드 준비");
    expect(getUploadStatusLabel("ready_for_review")).toBe("검토 준비");
    expect(getBooleanStatusLabel(true)).toBe("예");
    expect(getBooleanStatusLabel(false)).toBe("아니오");
  });
});
