import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { GET as getMockStorageAsset } from "../app/mock-storage/[bucket]/[...path]/route";

const testDir = join(process.cwd(), "python-worker", "outputs", "storage", "rendered-videos", "test-job");
const originalNodeEnv = process.env.NODE_ENV;
const originalEnableMockStorageRoute = process.env.ENABLE_MOCK_STORAGE_ROUTE;

function routeContext(bucket: string, path: string[]) {
  return { params: Promise.resolve({ bucket, path }) };
}

describe("mock storage route", () => {
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    restoreEnv();
  });

  test("serves local worker storage artifacts by bucket and path in dev/test", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.ENABLE_MOCK_STORAGE_ROUTE;
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

  test("returns 404 in production unless explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.ENABLE_MOCK_STORAGE_ROUTE;
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "video.mp4"), "mock video");

    const response = await getMockStorageAsset(
      new Request("http://localhost/mock-storage/rendered-videos/test-job/video.mp4"),
      routeContext("rendered-videos", ["test-job", "video.mp4"])
    );
    const body = await response.text();

    expect(response.status).toBe(404);
    expect(body).toContain("Not found.");
    expect(body).not.toContain(process.cwd());
    expect(body).not.toContain("python-worker");
  });

  test("serves artifacts in production when mock storage is explicitly enabled", async () => {
    process.env.NODE_ENV = "production";
    process.env.ENABLE_MOCK_STORAGE_ROUTE = "true";
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, "video.mp4"), "mock video");

    const response = await getMockStorageAsset(
      new Request("http://localhost/mock-storage/rendered-videos/test-job/video.mp4"),
      routeContext("rendered-videos", ["test-job", "video.mp4"])
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("mock video");
  });
});

function restoreEnv() {
  process.env.NODE_ENV = originalNodeEnv;
  if (originalEnableMockStorageRoute === undefined) {
    delete process.env.ENABLE_MOCK_STORAGE_ROUTE;
  } else {
    process.env.ENABLE_MOCK_STORAGE_ROUTE = originalEnableMockStorageRoute;
  }
}
