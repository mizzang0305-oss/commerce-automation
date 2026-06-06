import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { ArtifactQaClient } from "@/components/ArtifactQaClient";
import { OperatorCommandPalette } from "@/components/OperatorCommandPalette";

const pushMock = vi.fn();
let pathnameMock = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathnameMock,
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
    pathnameMock = "/dashboard";
    window.localStorage.clear();
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
    expect(screen.getByText("Safe Copy Commands")).toBeInTheDocument();
    expect(screen.getByText("Validation")).toBeInTheDocument();
    expect(screen.getByText("Python Worker")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /^Dashboard/i })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /Production Readiness/i }).length).toBeGreaterThan(0);
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

  test("records recent navigation and copy commands without storing command bodies", async () => {
    render(<OperatorCommandPalette />);

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click(await screen.findByRole("option", { name: /^Dashboard/i }));

    let recent = JSON.parse(window.localStorage.getItem("commerce.operatorCommandPalette.recent") ?? "[]");
    expect(recent[0]).toMatchObject({ id: "nav.dashboard", label: "Dashboard", type: "navigation" });
    expect(JSON.stringify(recent)).not.toContain("npm run");

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    fireEvent.click((await screen.findAllByRole("option", { name: /^Copy npm run test/i }))[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("npm run test");
    });
    recent = JSON.parse(window.localStorage.getItem("commerce.operatorCommandPalette.recent") ?? "[]");
    expect(recent[0]).toMatchObject({ id: "copy.test.full", label: "Copy npm run test", type: "copy" });
    expect(recent[0]).not.toHaveProperty("value");
    expect(recent[0]).not.toHaveProperty("command");
    expect(recent[0]).not.toHaveProperty("body");
    expect(JSON.stringify(recent)).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|WORKER_API_SECRET|Authorization/i);
    expect(screen.getByText("Recent Commands")).toBeInTheDocument();
  });

  test("favorite toggle persists safe command ids and renders favorites", async () => {
    render(<OperatorCommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /Open command palette/i }));
    expect(await screen.findByText("Favorites")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Artifacts/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Favorite Jobs/i }));

    const favoriteIds = JSON.parse(window.localStorage.getItem("commerce.operatorCommandPalette.favorites") ?? "[]");
    expect(favoriteIds).toContain("nav.jobs");
    expect(JSON.stringify(favoriteIds)).not.toMatch(/SECRET|Bearer|npm run/i);
  });

  test("context-aware commands and aliases surface page-specific safe options", async () => {
    pathnameMock = "/artifacts";
    render(<OperatorCommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /Open command palette/i }));

    expect(await screen.findByText("Context Suggestions")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /Open Pending Review Queue/i })).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /Copy artifact QA test command/i }).length).toBeGreaterThan(0);

    fireEvent.change(screen.getByPlaceholderText("Search operator commands..."), { target: { value: "qa" } });
    expect(screen.getByRole("option", { name: /Artifacts/i })).toBeInTheDocument();
  });

  test("safe copy commands copy text only and exclude forbidden commands or secrets", async () => {
    render(<OperatorCommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /Open command palette/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getAllByRole("option", { name: /^Copy npm run test/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Copy only").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No execution").length).toBeGreaterThan(0);

    const dialogText = screen.getByRole("dialog").textContent ?? "";
    expect(dialogText).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|R2_SECRET|WORKER_API_SECRET|COUPANG_SECRET_KEY|Authorization: Bearer/i);
    expect(dialogText).not.toMatch(/vercel deploy|vercel --prod|supabase db push|supabase migration up|videos\.insert|worker\.py/i);

    fireEvent.click(screen.getAllByRole("option", { name: /^Copy npm run test/i })[0]);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("npm run test");
    });
    expect(await screen.findByText("Copied safe command text. No command was executed.")).toBeInTheDocument();
  });

  test("command list contains no executable deploy, db-write, upload, or worker start commands", async () => {
    render(<OperatorCommandPalette />);

    fireEvent.click(screen.getByRole("button", { name: /Open command palette/i }));

    const dialogText = (await screen.findByRole("dialog")).textContent ?? "";
    expect(dialogText).not.toMatch(/vercel deploy|vercel --prod|supabase db push|supabase migration up/i);
    expect(dialogText).not.toMatch(/videos\.insert|upload_enabled=true|youtube_upload_enabled=true/i);
    expect(dialogText).not.toMatch(/Authorization: Bearer|SUPABASE_SERVICE_ROLE_KEY|COUPANG_SECRET_KEY|WORKER_API_SECRET/i);
    expect(dialogText).not.toMatch(/python-worker[\\/]+worker\.py|python worker\.py/i);
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
