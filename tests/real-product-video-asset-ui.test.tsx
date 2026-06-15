import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RealProductVideoAssetEntryPointPanel } from "@/components/RealProductVideoAssetEntryPointPanel";
import {
  APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION,
  RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION
} from "@/lib/uploads/youtube/oneProductVideoAssetEntryPoint";

describe("real product video asset entrypoint UI", () => {
  it("renders approval-gated video asset controls without upload or worker execution actions", () => {
    render(<RealProductVideoAssetEntryPointPanel />);

    expect(screen.getByRole("heading", { name: /One-product video asset entrypoint/i })).toBeInTheDocument();
    expect(screen.getByText(/server-accessible video\/mp4 asset/i)).toBeInTheDocument();
    expect(screen.getByLabelText("candidate_id")).toBeInTheDocument();
    expect(screen.getByLabelText("generation approval phrase")).toBeInTheDocument();
    expect(screen.getByLabelText("registration approval phrase")).toBeInTheDocument();
    expect(screen.getByText(RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION)).toBeInTheDocument();
    expect(screen.getByText(APPROVE_SINGLE_SERVER_ACCESSIBLE_VIDEO_ASSET_REGISTRATION)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Check candidate video asset readiness/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Generate local-only video contract/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Register server asset contract/i })).toBeDisabled();
    expect(screen.getByText(/YouTube Execute is not available here/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Execute$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /public upload/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Authorization/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/client_secret/i)).not.toBeInTheDocument();
  });

  it("calls the prepare route with dry-run mode and displays safe side-effect flags", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        message: "Candidate is ready for one-product video asset planning.",
        candidate: {
          candidate_id: "candidate-490aa6d25e8ea89d",
          product_name: "빌리빈 스테인리스 조리도구 8종 세트",
          affiliate_url_present: true,
          image_ready: true
        },
        generated_video_asset: null,
        prepared_video_asset_summary: null,
        registration_plan: null,
        side_effects: {
          video_generated: false,
          r2_uploaded: false,
          db_written: false,
          queue_created: false,
          worker_job_created: false,
          youtube_execute_called: false
        }
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RealProductVideoAssetEntryPointPanel />);
    screen.getByLabelText("candidate_id").focus();
    await screen.findByRole("button", { name: /Check candidate video asset readiness/i });
    screen.getByRole("button", { name: /Check candidate video asset readiness/i }).click();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/uploads/youtube/real-product-pilot/video-asset/prepare",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"mode":"dry_run"')
      })
    );
    expect(await screen.findByText(/Candidate is ready for one-product video asset planning/i)).toBeInTheDocument();
    expect(screen.getByText("youtube_execute_called")).toBeInTheDocument();
    expect(screen.getAllByText("false").length).toBeGreaterThan(0);
  });

  it("requires typed exact approval before sending local generation approval", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        message: "Local-only product video contract was generated.",
        generated_video_asset: {
          local_video_path_present: true,
          local_only: true,
          domain_ready: false,
          mime_type: "video/mp4",
          size_bytes: 8192
        },
        side_effects: {
          video_generated: true,
          local_file_written: true,
          r2_uploaded: false,
          db_written: false,
          queue_created: false,
          worker_job_created: false,
          youtube_execute_called: false
        }
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(<RealProductVideoAssetEntryPointPanel />);
    const button = screen.getByRole("button", { name: /Generate local-only video contract/i });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByLabelText("generation approval phrase"), {
      target: { value: RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION }
    });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      mode: "generate_local_only",
      approval: RUN_REAL_PRODUCT_VIDEO_ASSET_GENERATION
    });
    expect(await screen.findByText(/Local-only product video contract was generated/i)).toBeInTheDocument();
  });
});
