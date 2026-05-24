import { describe, expect, test } from "vitest";
import {
  buildSupabaseAssetRowsForWorkerJob,
  mapSupabaseWorkerJob,
  serializeSupabaseWorkerJobForWrite,
  validateSupabaseWorkerJobCompletion
} from "@/lib/repositories/supabaseAutomationRepository";

describe("supabase repository adapter helpers", () => {
  test("maps nullable worker job rows to repository worker job shape", () => {
    const job = mapSupabaseWorkerJob({
      id: "job-1",
      job_type: "video_render",
      status: "pending",
      product_queue_id: null,
      product_candidate_id: null,
      priority: 10,
      payload: null,
      result: null,
      claimed_by: null,
      claimed_at: null,
      heartbeat_at: null,
      error_message: null,
      retry_count: null,
      max_retries: null,
      created_at: "2026-05-24T00:00:00.000Z",
      started_at: null,
      finished_at: null
    });

    expect(job).toMatchObject({
      id: "job-1",
      job_type: "video_render",
      status: "pending",
      product_queue_id: "",
      product_candidate_id: "",
      payload: {},
      result: {},
      claimed_by: "",
      claimed_at: "",
      heartbeat_at: "",
      error_message: "",
      retry_count: 0,
      max_retries: 3,
      started_at: "",
      finished_at: ""
    });
  });

  test("rejects video render completion when video_url is missing", () => {
    const validation = validateSupabaseWorkerJobCompletion(
      mapSupabaseWorkerJob({
        id: "job-1",
        job_type: "video_render",
        status: "processing",
        product_queue_id: "queue-1",
        product_candidate_id: "",
        priority: 1,
        payload: {},
        result: {},
        claimed_by: "worker-1",
        claimed_at: "2026-05-24T00:00:00.000Z",
        heartbeat_at: "2026-05-24T00:00:00.000Z",
        error_message: "",
        retry_count: 0,
        max_retries: 3,
        created_at: "2026-05-24T00:00:00.000Z",
        started_at: "2026-05-24T00:00:00.000Z",
        finished_at: null
      }),
      { thumbnail_url: "https://storage.example/thumb.jpg" }
    );

    expect(validation.ok).toBe(false);
    expect(validation.errorMessage).toContain("video_url");
    expect(validation.status).toBe("retry_wait");
    expect(validation.retryCount).toBe(1);
  });

  test("serializes optional worker job timestamps as null for Postgres writes", () => {
    const row = serializeSupabaseWorkerJobForWrite({
      id: "job-1",
      job_type: "video_render",
      status: "pending",
      product_queue_id: "queue-1",
      product_candidate_id: "",
      priority: 1,
      payload: {},
      result: {},
      claimed_by: "",
      claimed_at: "",
      heartbeat_at: "",
      error_message: "",
      retry_count: 0,
      max_retries: 3,
      created_at: "2026-05-24T00:00:00.000Z",
      started_at: "",
      finished_at: ""
    });

    expect(row).toMatchObject({
      claimed_at: null,
      heartbeat_at: null,
      started_at: null,
      finished_at: null
    });
  });

  test("builds stable asset rows and excludes video when result has no video_url", () => {
    const job = mapSupabaseWorkerJob({
      id: "job-1",
      job_type: "video_render",
      status: "retry_wait",
      product_queue_id: "queue-1",
      product_candidate_id: "",
      priority: 1,
      payload: {},
      result: {
        thumbnail_url: "https://storage.example/thumb.jpg",
        srt_url: "https://storage.example/captions.srt",
        upload_package_url: "https://storage.example/package.txt"
      },
      claimed_by: "worker-1",
      claimed_at: "2026-05-24T00:00:00.000Z",
      heartbeat_at: "2026-05-24T00:00:00.000Z",
      error_message: "",
      retry_count: 1,
      max_retries: 3,
      created_at: "2026-05-24T00:00:00.000Z",
      started_at: "2026-05-24T00:00:00.000Z",
      finished_at: ""
    });

    const assets = buildSupabaseAssetRowsForWorkerJob(job, { includeVideo: false });

    expect(assets.map((asset) => asset.asset_type)).toEqual([
      "thumbnail",
      "subtitle",
      "upload_package"
    ]);
    expect(assets.map((asset) => asset.id)).toEqual([
      "asset-job-1-thumbnail",
      "asset-job-1-subtitle",
      "asset-job-1-upload_package"
    ]);
  });
});
