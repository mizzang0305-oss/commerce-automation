import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, test } from "vitest";

describe("V5 deterministic product cutout", () => {
  test("preserves a solid-background product through an alpha cutout", () => {
    const root = mkdtempSync(join(tmpdir(), "v5-cutout-"));
    const reference = join(root, "reference.ppm");
    const output = join(root, "cutout.png");
    const rows = Array.from({ length: 400 }, (_, y) => Array.from({ length: 400 }, (_, x) => x > 90 && x < 310 && y > 80 && y < 330 ? "20 40 80" : "255 255 255").join(" ")).join("\n");
    writeFileSync(reference, `P3\n400 400\n255\n${rows}\n`, "utf8");
    const stdout = execFileSync("python", [resolve("tools/video-automation/product_bound_composite_v5.py"), "prepare-cutout", "--reference", reference, "--output", output], { encoding: "utf8" });
    const result = JSON.parse(stdout) as { ok: boolean; alphaMaskRecorded: boolean; sourceImageSha256: string };
    expect(result).toMatchObject({ ok: true, alphaMaskRecorded: true });
    expect(result.sourceImageSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(readFileSync(output).subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
