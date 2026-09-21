import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { QueueCards } from "@/components/commerce-control/QueueCards";
import { QueueDetailEditor } from "@/components/commerce-control/QueueDetailEditor";
import { CommerceControlUnavailable } from "@/components/commerce-control/CommerceControlNav";
import type { SheetQueueItem } from "@/lib/google-sheets/sheetSchemas";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const item: SheetQueueItem = {
  queueId: "queue-001", registeredDate: "2026-08-01", slot: "07:30", progressStatus: "검토대기", productName: "모바일 테스트 상품",
  category: "생활", price: "12900", rawCoupangUrl: "https://example.invalid/raw", affiliateUrl: "https://example.invalid/affiliate",
  imageOrUsageScene: "https://example.invalid/product.jpg", videoUrl: "https://drive.google.com/file/d/WEB_MVP_TEST_VIDEO_FILE_ID/preview", voiceStatus: "완료", asrScore: 0.91,
  usageSceneConfirmed: "확인", humanReview: "미검토", qualityDecision: "검토필요", uploadStatus: "대기", youtubeUrl: "", errorMemo: "", lastModified: "2026-08-01 10:00:00"
};

describe("commerce control mobile-first UI", () => {
  test("renders queue cards with essential mobile actions", () => {
    render(<QueueCards items={[item]} />);
    expect(screen.getByText("모바일 테스트 상품")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "영상재생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "음성재생성" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "보류" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "제외" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PASS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "FAIL" })).toBeInTheDocument();
    expect(screen.getByLabelText("날짜 필터")).toBeInTheDocument();
    expect(screen.getByLabelText("시간대 필터")).toBeInTheDocument();
    expect(screen.getByLabelText("품질판정 필터")).toBeInTheDocument();
    expect(screen.getByLabelText("업로드상태 필터")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("상품 검색"), { target: { value: "없는 상품" } });
    expect(screen.queryByText("모바일 테스트 상품")).not.toBeInTheDocument();
  });

  test("renders Drive preview, errors and detail commands", () => {
    render(<QueueDetailEditor item={{ ...item, errorMemo: "ASR 확인 필요" }} />);
    expect(screen.getByTitle("생성 영상 미리보기")).toHaveAttribute("src", expect.stringContaining("drive.google.com"));
    expect(screen.getByRole("button", { name: "영상 다시 만들기" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PASS" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("ASR 확인 필요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수동 업로드 완료 기록" })).toBeDisabled();
    expect(screen.getByLabelText("영상 제목")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /상품 이미지/ })).toBeInTheDocument();
  });

  test("shows a safe not-configured state", () => {
    render(<CommerceControlUnavailable />);
    expect(screen.getByText("GOOGLE_SHEETS_NOT_CONFIGURED")).toBeInTheDocument();
    expect(screen.getByText(/성공으로 가장하지 않습니다/)).toBeInTheDocument();
  });
});
