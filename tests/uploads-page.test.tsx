import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import UploadsPage from "../app/uploads/page";

describe("platform uploads readiness page", () => {
  test("renders disabled provider readiness cards and approval-gated YouTube smoke notice", async () => {
    render(await UploadsPage());

    expect(screen.getByRole("heading", { name: /Platform Upload Readiness/i })).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getAllByText("upload_enabled=false")).toHaveLength(3);
    expect(screen.getByText(/YouTube supports only a server-side, approval-gated private or unlisted smoke path/i)).toBeInTheDocument();
    expect(screen.getByText(/This screen does not run uploads/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Upload$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate upload/i })).not.toBeInTheDocument();
  });
});
