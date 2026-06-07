import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import UploadsPage from "../app/uploads/page";

describe("platform uploads readiness page", () => {
  test("renders disabled provider readiness cards and copy-only upload planning notice", async () => {
    render(await UploadsPage());

    expect(screen.getByRole("heading", { name: /Platform Upload Readiness/i })).toBeInTheDocument();
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("TikTok")).toBeInTheDocument();
    expect(screen.getByText("Threads")).toBeInTheDocument();
    expect(screen.getAllByText("upload_enabled=false")).toHaveLength(3);
    expect(screen.getByText(/No live platform API calls are available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Upload/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Generate upload/i })).not.toBeInTheDocument();
  });
});
