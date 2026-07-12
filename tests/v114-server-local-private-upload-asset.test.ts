import crypto from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { buildPreparedVideoAssetReadiness } from "../src/lib/uploads/youtube/uploadAssetContract";
import { ServerYouTubeUploadAdapter } from "../src/lib/uploads/youtube/youtubeUploadAdapter";
import { bindV099PreparedVideoAssetEvidence } from "../src/uploads/youtube/v099PreparedAssetEvidenceBindingCore";
import {
  V114_SERVER_LOCAL_ASSET_STORAGE_KEY,
  createV114ServerLocalVideoAssetReader,
  prepareV114ServerLocalVideoAsset
} from "../src/uploads/youtube/v114ServerLocalPreparedVideoAsset";
import { PASSING_SHORTS_CONTENT_QUALITY } from "./fixtures/youtubeShortsContentQuality";
import { buildYouTubeUploadRequest } from "../src/lib/uploads/youtube/buildYoutubeUploadRequest";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("V114 server-local private upload asset bridge", () => {
  test("prepares only the canonical v057 father_jobs MP4 as an opaque local reference", async () => {
    const cwd = await fixture();
    const result = await prepareV114ServerLocalVideoAsset({
      cwd,
      queueItemId: "queue-v114-father"
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected local prepared asset");
    expect(result.assetRef).toMatchObject({
      provider: "server_local_file",
      storage_key: V114_SERVER_LOCAL_ASSET_STORAGE_KEY,
      prepared_video_asset_url: null,
      signed_url: null,
      mime_type: "video/mp4",
      server_accessible: true
    });
    expect(result.assetRef.checksum_sha256).toHaveLength(64);
    expect(buildPreparedVideoAssetReadiness({ prepared_video_asset: result.assetRef }).asset_ready).toBe(true);
    expect(bindV099PreparedVideoAssetEvidence({ preparedVideoAssetRef: result.assetRef }).ready).toBe(true);
    expect(JSON.stringify(result)).not.toContain(path.resolve(cwd));
  });

  test("blocks missing canonical file without exposing a path", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "v114-local-missing-"));
    roots.push(cwd);
    const result = await prepareV114ServerLocalVideoAsset({ cwd, queueItemId: "queue-v114" });

    expect(result).toMatchObject({
      ok: false,
      blocker: "BLOCKED_V114_CANONICAL_LOCAL_VIDEO_MISSING",
      raw_file_path_printed: false
    });
    expect(JSON.stringify(result)).not.toContain(path.resolve(cwd));
  });

  test("reader rejects arbitrary keys and mismatched evidence", async () => {
    const cwd = await fixture();
    const prepared = await prepareV114ServerLocalVideoAsset({ cwd, queueItemId: "queue-v114" });
    if (!prepared.ok) throw new Error("expected local prepared asset");
    const reader = createV114ServerLocalVideoAssetReader({ cwd });

    const wrongKey = await reader({
      ...prepared.assetRef,
      storage_key: "../../outside.mp4"
    });
    const wrongHash = await reader({
      ...prepared.assetRef,
      checksum_sha256: crypto.createHash("sha256").update("wrong").digest("hex")
    });

    expect(wrongKey).toMatchObject({ ok: false, blocked_reasons: ["server_local_asset_reference_not_allowed"] });
    expect(wrongHash).toMatchObject({ ok: false, blocked_reasons: ["server_local_asset_evidence_mismatch"] });
    expect(JSON.stringify([wrongKey, wrongHash])).not.toContain(path.resolve(cwd));
  });

  test("adapter reads local bytes through the injected server-only reader and uses mocked YouTube calls", async () => {
    const cwd = await fixture();
    const prepared = await prepareV114ServerLocalVideoAsset({ cwd, queueItemId: "queue-v114" });
    if (!prepared.ok) throw new Error("expected local prepared asset");
    const built = buildYouTubeUploadRequest({
      candidate_id: "queue-v114",
      prepared_video_asset: prepared.assetRef,
      video_path_or_url: "canonical-v057-video",
      title: "Private product preview",
      description: "Private product preview with disclosure.",
      disclosure_text: "이 콘텐츠는 쿠팡파트너스 활동의 일환으로 수수료를 제공받을 수 있습니다.",
      selected_affiliate_url: "https://link.coupang.com/a/fixture-only",
      shorts_content_quality: PASSING_SHORTS_CONTENT_QUALITY,
      visibility: "private"
    });
    if (!built.ok) throw new Error(`request not ready: ${built.missing_reasons.join(",")}`);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { Location: "https://upload.youtube.test/session" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "mock-video-id" }), { status: 200 }));

    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "fixture-token",
      fetchImpl,
      preparedVideoAssetReader: createV114ServerLocalVideoAssetReader({ cwd })
    }).upload(built.request);

    expect(result.succeeded).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0][1]?.method).toBe("POST");
    expect(fetchImpl.mock.calls[1][1]?.method).toBe("PUT");
    expect(result.side_effects.r2_uploaded).toBe(false);
  });

  test("adapter fails closed when the server-local reader is not injected", async () => {
    const cwd = await fixture();
    const prepared = await prepareV114ServerLocalVideoAsset({ cwd, queueItemId: "queue-v114" });
    if (!prepared.ok) throw new Error("expected local prepared asset");
    const built = buildYouTubeUploadRequest({
      candidate_id: "queue-v114",
      prepared_video_asset: prepared.assetRef,
      video_path_or_url: "canonical-v057-video",
      title: "Private product preview",
      description: "Private product preview with disclosure.",
      disclosure_text: "이 콘텐츠는 쿠팡파트너스 활동의 일환으로 수수료를 제공받을 수 있습니다.",
      selected_affiliate_url: "https://link.coupang.com/a/fixture-only",
      shorts_content_quality: PASSING_SHORTS_CONTENT_QUALITY,
      visibility: "private"
    });
    if (!built.ok) throw new Error("request should be ready");
    const fetchImpl = vi.fn();
    const result = await new ServerYouTubeUploadAdapter({
      accessToken: "fixture-token",
      fetchImpl
    }).upload(built.request);

    expect(result.succeeded).toBe(false);
    expect(result.blocked_reasons).toContain("server_local_asset_reader_required");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

async function fixture() {
  const cwd = await mkdtemp(path.join(tmpdir(), "v114-local-"));
  roots.push(cwd);
  const root = path.join(cwd, "commerce-assets", "review", "v057", "father_jobs");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "corrected-preview-v057.mp4"), Buffer.from("v114-local-video"));
  return cwd;
}
