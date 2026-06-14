import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RealProductAutoPilotFlow } from "@/components/RealProductAutoPilotFlow";

describe("RealProductAutoPilotFlow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders copy-only auto pilot controls without execute/upload actions", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      message: "Real product private package is prepared without executing upload.",
      selected_product: {
        candidate_id: "cand-real-001",
        product_name: "접이식 무선 선풍기",
        queue_id: "queue-real-001",
        affiliate_url_present: true,
        score: 95,
      },
      prepared_video_asset_summary: {
        asset_id: "asset-video-real-001",
        provider: "r2",
        server_accessible: true,
        mime_type: "video/mp4",
        size_bytes: 1234567,
        url_host: "cdn.example.com",
      },
      package_prepare: {
        ready: true,
        package_id: "youtube-product-private-cand-real",
        visibility: "private",
        domain_ready: true,
        prepared_video_asset_ref_used: true,
        blocked_reasons: [],
      },
      blocked_reasons: [],
      next_auto_action: "MANUAL_REVIEW_BEFORE_PRIVATE_EXECUTE",
      side_effects: {
        youtube_execute_called: false,
        youtube_upload_executed: false,
        db_written: false,
        r2_uploaded: false,
        worker_job_created: false,
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RealProductAutoPilotFlow />);

    expect(screen.getByText("Auto-select real product and prepare private package")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Execute disabled here" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Prepare real product private package" }));

    await waitFor(() => expect(screen.getByText("cand-real-001")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/youtube/real-product-pilot/auto-prepare",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ mode: "prepare_only", visibility: "private" }),
      }),
    );
    expect(screen.getByText("cdn.example.com")).toBeInTheDocument();
    expect(screen.getAllByText("false").length).toBeGreaterThan(0);

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/access_token|refresh_token|client_secret|Authorization|Bearer/i);
    expect(text).not.toContain("videos.insert");
  });
});
