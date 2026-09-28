import { describe, expect, it, vi } from "vitest";
import { MoneyPrinterTurboClient } from "../src/lib/moneyprinterturbo";

function response(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}

describe("MoneyPrinterTurboClient", () => {
  it("creates a portrait Korean short with safe defaults", async () => {
    const request = vi.fn(async () => response(200, { status: 200, data: { task_id: "task-1" } }));
    const client = new MoneyPrinterTurboClient({ baseUrl: "http://127.0.0.1:8080", apiKey: "secret" }, request);

    await expect(client.createVideo({ subject: "AI가 바꾼 직장인의 하루" })).resolves.toBe("task-1");
    expect(request).toHaveBeenCalledOnce();

    const [url, init] = request.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:8080/api/v1/videos");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("secret");

    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      video_subject: "AI가 바꾼 직장인의 하루",
      video_aspect: "9:16",
      video_count: 1,
      video_source: "pexels",
      video_language: "ko",
      subtitle_enabled: true,
      match_materials_to_script: true
    });
  });

  it("reads a completed task without exposing implementation-specific fields", async () => {
    const request = vi.fn(async () => response(200, {
      status: 200,
      data: {
        task_id: "task-2",
        state: 1,
        progress: 100,
        videos: ["/tasks/task-2/final.mp4"],
        combined_videos: []
      }
    }));
    const client = new MoneyPrinterTurboClient({ baseUrl: "http://localhost:8080" }, request);

    await expect(client.getTask("task-2")).resolves.toEqual({
      taskId: "task-2",
      state: 1,
      progress: 100,
      videos: ["/tasks/task-2/final.mp4"],
      combinedVideos: [],
      failedStage: "",
      error: ""
    });
  });

  it("rejects invalid base URLs and empty subjects before any request", async () => {
    expect(() => new MoneyPrinterTurboClient({ baseUrl: "localhost:8080" })).toThrow("MPT_BASE_URL_INVALID");

    const request = vi.fn(async () => response(500, {}));
    const client = new MoneyPrinterTurboClient({ baseUrl: "http://localhost:8080" }, request);
    await expect(client.createVideo({ subject: " " })).rejects.toThrow("MPT_SUBJECT_REQUIRED");
    expect(request).not.toHaveBeenCalled();
  });
});
