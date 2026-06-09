import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import UploadsPage from "../app/uploads/page";
import {
  APPROVE_YOUTUBE_PRIVATE_UPLOAD,
  RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE,
  YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID
} from "@/lib/uploads/youtube";

function clearYouTubeEnv() {
  for (const name of [
    "YOUTUBE_LOCAL_TOKEN_FILE_PATH",
    "YOUTUBE_TOKEN_FILE",
    "YOUTUBE_TOKEN_PROVIDER",
    "YOUTUBE_TOKEN_READY",
    "YOUTUBE_SCOPES_READY",
    "YOUTUBE_UPLOAD_ENABLED",
    "YOUTUBE_QUOTA_READY",
    "YOUTUBE_ACCOUNT_READY",
    "YOUTUBE_POLICY_READY",
    "PUBLIC_UPLOAD_ENABLED"
  ]) {
    vi.stubEnv(name, "");
  }
}

describe("YouTube uploads page readiness panel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("renders YouTube adapter readiness with private or unlisted gates only", async () => {
    clearYouTubeEnv();

    render(await UploadsPage());

    expect(screen.getByRole("heading", { name: /YouTube Upload Adapter/i })).toBeInTheDocument();
    expect(screen.getAllByText(/private\/unlisted/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(APPROVE_YOUTUBE_PRIVATE_UPLOAD).length).toBeGreaterThan(0);
    expect(screen.getByText(/public upload is blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/OAuth tokens are not entered or shown/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /YouTube Local Token Provider/i })).toBeInTheDocument();
    expect(screen.getByText(/Token values, refresh tokens, access tokens/i)).toBeInTheDocument();
    expect(screen.getByText(/token_file_path_missing/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /YouTube dashboard private smoke/i })).toBeInTheDocument();
    expect(screen.getByLabelText("candidate_id")).toHaveValue(YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID);
    expect(String(screen.getByLabelText("local mp4 path").getAttribute("value"))).toContain("youtube-private-smoke-001.mp4");
    expect(screen.getByRole("option", { name: /public disabled/i })).toBeDisabled();
    expect(screen.getByText(/contains 쿠팡파트너스/i)).toBeInTheDocument();
    expect(screen.getByText(/contains 수수료/i)).toBeInTheDocument();
    expect(screen.getByText(/garbled disclosure absent/i)).toBeInTheDocument();
    expect(screen.getAllByText(/UTF-8 browser payload/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Prepare from dashboard/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Execute private smoke/i })).toBeDisabled();
    expect(screen.getByRole("heading", { name: /Private upload result verification/i })).toBeInTheDocument();
    expect(screen.getByText(/Studio visibility verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Korean disclosure verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Result tracking is manual and copy-only/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/refresh token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Public upload/i })).not.toBeInTheDocument();
  });

  test("blocks garbled disclosure before dashboard prepare", async () => {
    clearYouTubeEnv();

    render(await UploadsPage());

    fireEvent.change(screen.getByLabelText("disclosure_text preview"), {
      target: { value: "? ???? ?? ???? ??? ????, ?? ?? ???? ???? ? ????." }
    });

    expect(screen.getByText(/disclosure_text_garbled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prepare from dashboard/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Execute private smoke/i })).toBeDisabled();
  });

  test("uses browser fetch for prepare and keeps execute gated by exact phrases", async () => {
    clearYouTubeEnv();
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/api/uploads/youtube/prepare")) {
        return Response.json({
          ok: true,
          request: { candidate_id: YOUTUBE_PRIVATE_SMOKE_CANDIDATE_ID, visibility: "private" },
          side_effects: {
            external_api_called: false,
            youtube_upload_executed: false,
            uploaded: false,
            public_upload_enabled: false
          },
          approval_required: true
        });
      }
      return Response.json({ ok: false }, { status: 500 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(await UploadsPage());

    fireEvent.click(screen.getByRole("button", { name: /Prepare from dashboard/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/uploads/youtube/prepare");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
    expect(screen.getByText(/Prepare ok/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Execute private smoke/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("execute confirmation"), {
      target: { value: APPROVE_YOUTUBE_PRIVATE_UPLOAD }
    });
    expect(screen.getByRole("button", { name: /Execute private smoke/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("separate smoke approval"), {
      target: { value: RUN_YOUTUBE_PRIVATE_UPLOAD_SMOKE }
    });
    expect(screen.getByRole("button", { name: /Execute private smoke/i })).toBeEnabled();
  });

  test("result verification requires youtube_video_id and Korean disclosure verification", async () => {
    clearYouTubeEnv();
    render(await UploadsPage());

    expect(screen.getByText(/final_verified/i).closest("div")).toHaveTextContent("false");
    fireEvent.click(screen.getByLabelText(/Studio visibility private/i));
    fireEvent.click(screen.getByLabelText(/Studio title correct/i));
    fireEvent.click(screen.getByLabelText(/Korean disclosure correct/i));
    expect(screen.getByText(/final_verified/i).closest("div")).toHaveTextContent("false");
  });
});
