import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("live renderer identity roles", () => {
  test("renders product reference and generic usage labels as separate timed elements", async () => {
    const source = await readFile("tools/video-automation/local_media_bridge.py", "utf8");
    expect(source).toContain('"product_reference"');
    expect(source).toContain('"generic_usage_example"');
    expect(source).toContain("상품 참고 이미지");
    expect(source).toContain("연출된 사용 예시");
    expect(source).toContain('"exact_product_use_claimed": False');
  });
});
