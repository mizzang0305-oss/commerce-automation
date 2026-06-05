import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ArtifactQaClient } from "@/components/ArtifactQaClient";

const artifacts = [
  {
    id: "artifact-video-1",
    product_queue_id: "queue-video-1",
    product_name: "QA product",
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("artifact QA productivity", () => {
  test("review queue shortcuts map to safe filter query params", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, artifacts, summary })
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(<ArtifactQaClient artifacts={artifacts} summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: "Missing Assets" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("missing=has_warnings"),
        expect.any(Object)
      );
    });
  });

  test("bulk note templates populate qa_note input", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ ok: true, artifacts, summary })
      }))
    );

    render(<ArtifactQaClient artifacts={artifacts} summary={summary} />);
    fireEvent.change(screen.getByLabelText("Bulk note template"), {
      target: { value: "Subtitle timing needs operator review." }
    });

    expect(screen.getByPlaceholderText("Bulk QA note")).toHaveValue("Subtitle timing needs operator review.");
  });

  test("keyboard shortcuts skip focused inputs and safe QA actions do not imply upload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ ok: true, artifacts, summary })
    })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(<ArtifactQaClient artifacts={artifacts} summary={summary} />);
    const search = screen.getByPlaceholderText("Search product, queue id, or URL");
    search.focus();
    fireEvent.keyDown(window, { key: "p" });

    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("/api/artifacts/artifact-video-1/qa"), expect.any(Object));
    fireEvent.blur(search);
    fireEvent.keyDown(window, { key: "p" });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/artifacts/artifact-video-1/qa",
        expect.objectContaining({ method: "POST" })
      );
    });
    expect(await screen.findByText("QA status only changed. No platform upload was executed.")).toBeInTheDocument();
  });
});
