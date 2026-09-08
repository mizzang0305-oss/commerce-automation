import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertV2AReceiptContainsNoSecrets,
  buildV2AAmbiguousMarker,
  buildV2AIdempotencyKey,
  buildV2APrivateUploadReceipt,
  createV2AFileIdempotencyStore
} from "@/uploads/youtube/v2a/idempotencyReceipt";

const temporaryRoots: string[] = [];
const channelId = `UC${"a".repeat(22)}`;
const videoSha256 = "b".repeat(64);
const uploadPackageSha256 = "c".repeat(64);

async function makeStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "youtube-v2a-receipts-"));
  temporaryRoots.push(root);
  return createV2AFileIdempotencyStore(root);
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

describe("YouTube upload V2-A idempotency and immutable receipts", () => {
  it("derives a stable key from the exact channel, bytes, product, and operation", () => {
    const input = { channelId, videoSha256, productId: "product-001", operationNamespace: "operation-2026-09-09" };
    expect(buildV2AIdempotencyKey(input)).toBe(buildV2AIdempotencyKey(input));
    expect(buildV2AIdempotencyKey({ ...input, productId: "product-002" })).not.toBe(buildV2AIdempotencyKey(input));
  });

  it("writes one allowlisted success receipt and prevents duplicate uploads", async () => {
    const store = await makeStore();
    const receipt = buildV2APrivateUploadReceipt({
      operationNamespace: "operation-2026-09-09",
      productId: "product-001",
      videoSha256,
      uploadPackageSha256,
      targetChannelId: channelId,
      youtubeVideoId: "a1B2c3D4e5F",
      privacyStatus: "private",
      createdAt: "2026-09-08T10:00:00.000Z",
      completedAt: "2026-09-08T10:01:00.000Z",
      apiOutcome: "verified_private",
      sourceGitSha: "d".repeat(40),
      adapterVersion: "youtube-v2a-resumable.v1"
    });

    await expect(store.reserve(receipt.idempotencyKey)).resolves.toBe(true);
    const receiptPath = await store.writeSuccess(receipt);
    expect(path.basename(receiptPath)).toBe(`${receipt.idempotencyKey}.success.json`);
    await expect(store.writeSuccess(receipt)).rejects.toMatchObject({ code: "EEXIST" });
    await expect(store.lookup(receipt.idempotencyKey)).resolves.toEqual({ status: "successful", receipt });
    await expect(store.reserve(receipt.idempotencyKey)).resolves.toBe(false);

    const stored = await fs.readFile(receiptPath, "utf8");
    expect(stored).not.toMatch(/access_token|refresh_token|client_secret|authorization|upload_id=/i);
    expect(receipt.mock).toBe(false);
    expect(receipt.productionUpload).toBe(true);
  });

  it("holds ambiguous outcomes until reconciliation instead of accepting a fresh success", async () => {
    const store = await makeStore();
    const idempotencyKey = buildV2AIdempotencyKey({
      channelId,
      videoSha256,
      productId: "product-001",
      operationNamespace: "operation-2026-09-09"
    });
    const marker = buildV2AAmbiguousMarker({
      idempotencyKey,
      operationNamespace: "operation-2026-09-09",
      productId: "product-001",
      videoSha256,
      targetChannelId: channelId,
      createdAt: "2026-09-08T10:01:00.000Z"
    });
    await store.markAmbiguous(marker);
    await expect(store.lookup(idempotencyKey)).resolves.toEqual({ status: "ambiguous", marker });

    const receipt = buildV2APrivateUploadReceipt({
      operationNamespace: marker.operationNamespace,
      productId: marker.productId,
      videoSha256: marker.videoSha256,
      uploadPackageSha256,
      targetChannelId: marker.targetChannelId,
      youtubeVideoId: "a1B2c3D4e5F",
      privacyStatus: "private",
      createdAt: marker.createdAt,
      completedAt: "2026-09-08T10:02:00.000Z",
      apiOutcome: "verified_private",
      sourceGitSha: "d".repeat(40),
      adapterVersion: "youtube-v2a-resumable.v1"
    });
    await expect(store.writeSuccess(receipt)).rejects.toThrow("AMBIGUOUS_UPLOAD_REQUIRES_RECONCILIATION");
  });

  it("atomically reserves one upload attempt and rejects a concurrent reservation", async () => {
    const store = await makeStore();
    const key = buildV2AIdempotencyKey({ channelId, videoSha256, productId: "product-001", operationNamespace: "operation-2026-09-09" });
    const results = await Promise.all([store.reserve(key), store.reserve(key)]);
    expect(results.sort()).toEqual([false, true]);
    await expect(store.lookup(key)).resolves.toEqual({ status: "reserved" });
  });

  it("rejects a forged stored success receipt", async () => {
    const store = await makeStore();
    const key = buildV2AIdempotencyKey({ channelId, videoSha256, productId: "product-001", operationNamespace: "operation-2026-09-09" });
    const root = temporaryRoots.at(-1)!;
    await fs.writeFile(path.join(root, `${key}.success.json`), JSON.stringify({ idempotencyKey: key, privacyStatus: "private" }));
    await expect(store.lookup(key)).rejects.toThrow("INVALID_STORED_RECEIPT_SCHEMA");
  });

  it("rejects a malformed reservation tombstone", async () => {
    const store = await makeStore();
    const key = buildV2AIdempotencyKey({ channelId, videoSha256, productId: "product-001", operationNamespace: "operation-2026-09-09" });
    await fs.writeFile(path.join(temporaryRoots.at(-1)!, `${key}.uploading.json`), "{}\n");
    await expect(store.lookup(key)).rejects.toThrow("INVALID_STORED_RESERVATION_SCHEMA");
  });

  it("rejects secret-shaped values even when passed through an untrusted stored object", () => {
    const marker = buildV2AAmbiguousMarker({
      idempotencyKey: "e".repeat(64),
      operationNamespace: "operation-2026-09-09",
      productId: "product-001",
      videoSha256,
      targetChannelId: channelId,
      createdAt: "2026-09-08T10:01:00.000Z"
    });
    expect(() => assertV2AReceiptContainsNoSecrets({ ...marker, reasonCode: "Authorization: Bearer secret" } as never)).toThrow(
      "RECEIPT_SECRET_MATERIAL_REJECTED"
    );
  });
});
