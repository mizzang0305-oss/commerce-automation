import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import UploadsPage from "../app/uploads/page";
import { APPROVE_YOUTUBE_PRIVATE_UPLOAD } from "@/lib/uploads/youtube";

describe("YouTube uploads page readiness panel", () => {
  test("renders YouTube adapter readiness with private or unlisted gates only", async () => {
    render(await UploadsPage());

    expect(screen.getByRole("heading", { name: /YouTube Upload Adapter/i })).toBeInTheDocument();
    expect(screen.getAllByText(/private\/unlisted/i).length).toBeGreaterThan(0);
    expect(screen.getByText(APPROVE_YOUTUBE_PRIVATE_UPLOAD)).toBeInTheDocument();
    expect(screen.getByText(/public upload is blocked/i)).toBeInTheDocument();
    expect(screen.getByText(/OAuth tokens are not entered or shown/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Prepare request/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Execute upload/i })).toBeDisabled();
    expect(screen.queryByLabelText(/refresh token/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/access token/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Public upload/i })).not.toBeInTheDocument();
  });
});
