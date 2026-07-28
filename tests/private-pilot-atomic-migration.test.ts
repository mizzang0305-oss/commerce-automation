import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/20260728161722_private_pilot_atomic_reservation.sql"
);

describe("private pilot atomic migration", () => {
  test("declares uniqueness, transition states, authoritative joins, and service-role-only RPC grants", async () => {
    const sql = await readFile(MIGRATION, "utf8");
    expect(sql).toContain("nonce_sha256 text not null unique");
    expect(sql).toContain("v_approval.nonce_sha256 <> p_nonce_sha256");
    expect(sql).toContain("upload_package_id text not null unique");
    expect(sql).toContain("kst_upload_date date not null unique");
    for (const state of [
      "reserved",
      "external_call_started",
      "completed",
      "failed_before_external_call",
      "human_review_required"
    ]) {
      expect(sql).toContain(`'${state}'`);
    }
    expect(sql).toContain("join public.worker_jobs job");
    expect(sql).toContain("asset.qa_status = 'passed'");
    expect(sql).toContain("queue.manual_review_status = 'approved'");
    expect(sql).toContain("asset.render_qa_metadata->>'video_checksum_sha256'");
    expect(sql).toMatch(/revoke all on function public\.reserve_private_pilot_upload[\s\S]+from public, anon, authenticated/);
    expect(sql).toMatch(/grant execute on function public\.reserve_private_pilot_upload[\s\S]+to service_role/);
  });
});
