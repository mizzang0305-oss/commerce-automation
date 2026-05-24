import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GET as getMockStorageAsset } from "../app/mock-storage/[bucket]/[...path]/route";

const testDir = join(process.cwd(), "python-worker", "outputs", "storage", "rendered-videos", "test-job");

function routeContext(bucket: string, path: string[]) {
  return { params: Promise.resolve({ bucket, path }) };
}

describe("mock storage route", () => {
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("serves local worker storage artifacts by bucket and path", async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "video.mp4"), "mock video");

    const response = await getMockStorageAsset(
      new Request("http://localhost/mock-storage/rendered-videos/test-job/video.mp4"),
      routeContext("rendered-videos", ["test-job", "video.mp4"])
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("mock video");
    expect(response.headers.get("content-type")).toBe("video/mp4");
  });
});
