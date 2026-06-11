import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import UploadsPage from "../app/uploads/page";

describe("platform uploads readiness page", () => {
  test("renders disabled provider readiness cards and approval-gated YouTube smoke notice", async () => {
    render(await UploadsPage());

    expect(screen.getByRole("heading", { name: "업로드 준비 대시보드" })).toBeInTheDocument();
    expect(screen.getByText(/YouTube 비공개 smoke readiness를 한국어로 진단/)).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getAllByText("upload_enabled=false")).toHaveLength(3);
    expect(screen.getByText("YouTube 업로드 기능 플래그")).toBeInTheDocument();
    expect(screen.getAllByText("공개 업로드 차단").length).toBeGreaterThan(0);
    expect(screen.getByText(/대시보드는 DB write, R2 upload, queue row/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Upload$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate upload/i })).not.toBeInTheDocument();
  });
});
