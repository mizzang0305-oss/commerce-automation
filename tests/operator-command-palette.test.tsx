import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ArtifactQaClient } from "@/components/ArtifactQaClient";
import { OperatorCommandPalette } from "@/components/OperatorCommandPalette";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock })
}));

const artifacts = [
  {
    id: "artifact-palette-1",
    product_queue_id: "queue-palette-1",
    product_name: "Palette QA product",
    video_url: "https://r2.example.com/video.mp4",
    thumbnail_url: "https://r2.example.com/thumb.jpg",
    subtitle_url: "https://r2.example.com/subtitle.srt",
    upload_package_url: "https://r2.example.com/package.json",
    video_exists: true,
    thumbnail_exists: true,
    subtitle_exists: true,
    upload_package_exists: true,
    asset_types: ["video", "thumbnail", "subtitle", "upload_package"],
    missing_asset_types: [],
    qa_status: "pending" as const,
    qa_note: "",
    created_at: "2026-06-05T00:00:00.000Z"
  }
];

const summary = {
  total: 1,
  pending: 1,
  passed: 0,
  needs_fix: 0,
  rejected: 0,
  missing_video: 0,
  missing_thumbnail: 0,
  missing_subtitle: 0,
  missing_upload_package: 0
};

describe("operator command palette", () => {
  beforeEach(() => {
    pushMock.mockReset();
    class ResizeObserverMock {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    Element.prototype.scrollIntoView = vi.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async () => undefined)
      }
    });
  });

  test("opens with Ctrl+K, renders safe navigation, and closes with Escape", async () => {
    render(<OperatorCommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search operator commands...")).toHaveFocus();
    expect(screen.getByText("Navigation")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Dashboard/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Production Readiness/i })).toBeInTheDocument();
    expect(screen.getByText("Command Palette는 페이지 이동과 안전한 명령어 복사만 지원합니다.")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  test("navigation commands push routes without calling mutation APIs", async () => {
    const fetchMock = vi.fn() as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);
    render(<OperatorCommandPalette />);

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    fireEvent.click(await screen.findByRole("option", { name: /Artifacts/i }));

    expect(pushMock).toHaveBeenCalledWith("/artifacts");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("safe copy commands copy text only and exclude forbidden commands or secrets", async () => {
    render(<OperatorCommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /Open command palette/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Copy npm run test/i })).toBeInTheDocument();
    expect(screen.getAllByText("Copy only").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No execution").length).toBeGreaterThan(0);

    const dialogText = screen.getByRole("dialog").textContent ?? "";
    expect(dialogText).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|R2_SECRET|WORKER_API_SECRET|COUPANG_SECRET_KEY|Authorization: Bearer/i);
    expect(dialogText).not.toMatch(/vercel deploy|vercel --prod|supabase db push|videos\.insert|worker\.py/i);

    fireEvent.click(screen.getByRole("option", { name: /Copy npm run test/i }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("npm run test");
    });
    expect(await screen.findByText("Copied safe command text. No command was executed.")).toBeInTheDocument();
  });

  test("artifact QA shortcuts are ignored while command palette is open", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, artifacts, summary })
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <OperatorCommandPalette />
        <ArtifactQaClient artifacts={artifacts} summary={summary} />
      </>
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "p" });

    expect(fetchMock).not.toHaveBeenCalledWith("/api/artifacts/artifact-palette-1/qa", expect.any(Object));
  });
});
