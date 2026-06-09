import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import UploadsPage from "../app/uploads/page";
import { APPROVE_YOUTUBE_PRIVATE_UPLOAD } from "@/lib/uploads/youtube";

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
    expect(screen.getByText(APPROVE_YOUTUBE_PRIVATE_UPLOAD)).toBeInTheDocument();
    expect(screen.getByText(/public upload is blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/OAuth tokens are not entered or shown/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /YouTube Local Token Provider/i })).toBeInTheDocument();
    expect(screen.getByText(/Token values, refresh tokens, access tokens/i)).toBeInTheDocument();
    expect(screen.getByText(/token_file_path_missing/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prepare request/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Execute upload/i })).toBeDisabled();
    expect(screen.getByRole("heading", { name: /Private upload result verification/i })).toBeInTheDocument();
    expect(screen.getByText(/Studio visibility verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Korean disclosure verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Result tracking is manual and copy-only/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/refresh token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Public upload/i })).not.toBeInTheDocument();
  });
});
