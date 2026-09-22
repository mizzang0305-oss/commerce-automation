import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { resolveExactProductReference } from "@/lib/live-product-video";
import { candidate } from "./fixtures";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe("exact product reference resolver", () => {
  test("validates HTTPS/MIME/size/decode and keeps product_reference semantics", async () => {
    const root = await mkdtemp(join(tmpdir(), "live-product-image-")); roots.push(root);
    const result = await resolveExactProductReference({
      candidate: candidate(),
      outputDir: root,
      pythonExe: "unused",
      visualQaScript: "unused",
      fetchImpl: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) as typeof fetch,
      probeImage: async () => ({ width: 800, height: 800, sizeBytes: 3 })
    });
    expect(result).toMatchObject({ identityType: "product_reference", width: 800, height: 800, sizeBytes: 3 });
    expect(await readFile(result.localPath)).toHaveLength(3);
  });

  test("blocks non-image responses before decode", async () => {
    const root = await mkdtemp(join(tmpdir(), "live-product-image-")); roots.push(root);
    await expect(resolveExactProductReference({ candidate: candidate(), outputDir: root, pythonExe: "unused", visualQaScript: "unused", fetchImpl: vi.fn(async () => new Response("html", { status: 200, headers: { "content-type": "text/html" } })) as typeof fetch })).rejects.toThrow("PRODUCT_IMAGE_MIME_INVALID");
  });

  test("blocks untrusted image hosts and undersized decoded images", async () => {
    const root = await mkdtemp(join(tmpdir(), "live-product-image-")); roots.push(root);
    await expect(resolveExactProductReference({
      candidate: candidate({ productImageUrls: ["https://example.com/product.jpg"] }),
      outputDir: root,
      pythonExe: "unused",
      visualQaScript: "unused",
      fetchImpl: vi.fn() as typeof fetch
    })).rejects.toThrow("PRODUCT_IMAGE_NOT_READY");
    await expect(resolveExactProductReference({
      candidate: candidate(),
      outputDir: root,
      pythonExe: "unused",
      visualQaScript: "unused",
      fetchImpl: vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/jpeg" } })) as typeof fetch,
      probeImage: async () => ({ width: 200, height: 200, sizeBytes: 3 })
    })).rejects.toThrow("PRODUCT_IMAGE_DECODE_FAILED");
  });
});
