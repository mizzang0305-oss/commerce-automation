import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ArtifactQaClient } from "@/components/ArtifactQaClient";

const summary = {
  total: 150,
  pending: 150,
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

describe("artifact QA virtualized table", () => {
  test("bounds rendered artifact rows even when the API returns an oversized page", async () => {
    const artifacts = makeArtifacts(150);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          artifacts,
          summary,
          pagination: { page: 1, page_size: 100, total_items: 150, total_pages: 2, has_next: true, has_prev: false }
        })
      }))
    );

    render(
      <ArtifactQaClient
        artifacts={artifacts}
        summary={summary}
        pagination={{ page: 1, page_size: 100, total_items: 150, total_pages: 2, has_next: true, has_prev: false }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Large-list optimized view active")).toBeInTheDocument();
    });

    expect(screen.getAllByRole("checkbox", { name: /^Select Artifact product/ })).toHaveLength(100);
    expect(screen.queryByText("Artifact product 101")).not.toBeInTheDocument();
  });

  test("select all is page-scoped and page size changes clear the selection", async () => {
    const artifacts = makeArtifacts(100);
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url);
      const pageSize = requestUrl.includes("page_size=25") ? 25 : 100;
      return {
        ok: true,
        json: async () => ({
          ok: true,
          artifacts: artifacts.slice(0, pageSize),
          summary,
          pagination: { page: 1, page_size: pageSize, total_items: 150, total_pages: Math.ceil(150 / pageSize), has_next: true, has_prev: false }
        })
      };
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ArtifactQaClient
        artifacts={artifacts}
        summary={summary}
        pagination={{ page: 1, page_size: 100, total_items: 150, total_pages: 2, has_next: true, has_prev: false }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    expect(screen.getByText("100 selected")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Page size"), { target: { value: "25" } });

    await waitFor(() => {
      expect(screen.getByText("0 selected")).toBeInTheDocument();
    });
    expect(screen.getAllByRole("checkbox", { name: /^Select Artifact product/ })).toHaveLength(25);
  });

  test("keyboard selection stays inside the visible page and Escape clears it", async () => {
    const artifacts = makeArtifacts(3);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          ok: true,
          artifacts,
          summary: { ...summary, total: 3, pending: 3 },
          pagination: { page: 1, page_size: 25, total_items: 3, total_pages: 1, has_next: false, has_prev: false }
        })
      }))
    );

    render(<ArtifactQaClient artifacts={artifacts} summary={{ ...summary, total: 3, pending: 3 }} />);

    fireEvent.keyDown(window, { key: "x" });
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "j" });
    fireEvent.keyDown(window, { key: "x" });
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[1]).getByRole("checkbox", { name: "Select Artifact product 2" })).toBeChecked();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });
});

function makeArtifacts(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    return {
      id: `artifact-virtual-${number}`,
      product_queue_id: `queue-virtual-${number}`,
      product_name: `Artifact product ${number}`,
      video_url: `https://r2.example.com/rendered-videos/video-${number}.mp4`,
      thumbnail_url: `https://r2.example.com/thumbnails/thumb-${number}.jpg`,
      subtitle_url: `https://r2.example.com/subtitles/subtitle-${number}.srt`,
      upload_package_url: `https://r2.example.com/upload-packages/package-${number}.json`,
      video_exists: true,
      thumbnail_exists: true,
      subtitle_exists: true,
      upload_package_exists: true,
      asset_types: ["video", "thumbnail", "subtitle", "upload_package"],
      missing_asset_types: [],
      qa_status: "pending" as const,
      qa_note: "",
      created_at: "2026-06-05T00:00:00.000Z"
    };
  });
}
