import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

import {
  buildProductionPilotPreflightReport,
  formatPreflightReport
} from "../scripts/production-pilot-preflight.mjs";

describe("production pilot preflight", () => {
  test("prints readiness status without raw secrets or deploy side effects", () => {
    const env = {
      AUTOMATION_REPOSITORY_ADAPTER: "supabase",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-value",
      WORKER_API_SECRET: "worker-secret-value",
      PUBLIC_APP_BASE_URL: "https://example.vercel.app",
      CONTENT_AI_PROVIDER: "template",
      WEB_APP_BASE_URL: "https://example.vercel.app",
      WORKER_ID: "local-worker",
      WORKER_JOB_TYPES: "video_render,sheet_sync",
      STORAGE_BACKEND: "r2",
      R2_ENDPOINT_URL: "https://account.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "r2-access-key",
      R2_SECRET_ACCESS_KEY: "r2-secret-value",
      R2_REGION: "auto",
      R2_PUBLIC_BASE_URL_RENDERED_VIDEOS: "https://video.example.com",
      R2_PUBLIC_BASE_URL_THUMBNAILS: "https://thumb.example.com",
      R2_PUBLIC_BASE_URL_SUBTITLES: "https://subtitle.example.com",
      R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES: "https://package.example.com"
    };

    const report = buildProductionPilotPreflightReport(env);
    const output = formatPreflightReport(report);

    expect(report.ready_for_deploy).toBe(false);
    expect(report.approval_required).toBe(true);
    expect(report.summary.missing_required).toBe(0);
    expect(report.summary.manual_pending).toBeGreaterThan(0);
    expect(report.env_groups.map((group) => group.key)).toEqual([
      "webapp_base",
      "supabase",
      "local_worker",
      "r2",
      "ai_coupang",
      "safety_flags"
    ]);
    expect(report.env_groups.reduce((total, group) => total + group.required, 0)).toBe(19);
    expect(report.manual_groups.map((group) => group.key)).toEqual(["vercel", "supabase", "r2", "local_worker", "rollback_approval"]);
    expect(report.manual_groups.reduce((total, group) => total + group.pending, 0)).toBe(10);
    expect(report.readiness_formula).toMatchObject({
      all_required_env_configured: true,
      all_manual_checks_completed: false,
      explicit_approval_present: false,
      deploy_command_not_executed: true,
      vercel_cli_not_invoked: true,
      raw_secret_values_not_printed: true,
      production_pilot_ready: false
    });
    expect(report.safety.deploy_command_executed).toBe(false);
    expect(report.safety.vercel_cli_invoked).toBe(false);
    expect(report.safety.supabase_cli_invoked).toBe(false);
    expect(report.safety.r2_network_call_executed).toBe(false);
    expect(output).toContain("production_pilot_preflight_ready=false");
    expect(output).toContain("approval_required=true");
    expect(output).toContain("ENV_GROUP webapp_base configured=3/3 missing=0 status=configured");
    expect(output).toContain("ENV_GROUP ai_coupang configured=1/1 missing=0 status=configured");
    expect(output).toContain("ENV_GROUP safety_flags configured=0/0 missing=0 status=configured");
    expect(output).toContain("MANUAL_GROUP rollback_approval completed=0 pending=2 status=pending");
    expect(output).toContain("DEPLOY_COMMAND_EXECUTED false");
    expect(output).not.toContain("supabase-secret-value");
    expect(output).not.toContain("worker-secret-value");
    expect(output).not.toContain("r2-secret-value");
    expect(output).not.toContain("https://project.supabase.co");
    expect(output).not.toContain("https://account.r2.cloudflarestorage.com");
  });

  test("documents approval-gated Vercel, Supabase, R2, and Worker readiness", () => {
    const doc = readFileSync("docs/PRODUCTION_PILOT_PREFLIGHT.md", "utf8");
    const checklist = readFileSync("checklists/production-pilot-preflight-checklist.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const qa = readFileSync("docs/08_TEST_AND_QA_CHECKLIST.md", "utf8");

    expect(doc).toContain("Status: preparation only.");
    expect(doc).toContain("Production pilot readiness closeout is not a deploy.");
    expect(doc).toContain("Production pilot is ready only when env, manual evidence, and explicit approval are all complete.");
    expect(doc).toContain("npm run preflight:production-pilot");
    expect(doc).toContain("The preflight checks only readiness inputs.");
    expect(doc).toContain("The preflight script does not contact R2.");
    expect(doc).toContain("The WebApp must not launch Python Worker.");
    expect(doc).toContain("Passing smoke still does not enable YouTube, TikTok, Threads");
    expect(doc).toContain("Do not report PASS when artifact upload, worker completion, or `video_url` verification is missing.");

    expect(checklist).toContain("Operator explicitly approved the production pilot timing.");
    expect(checklist).toContain("No deploy command has been run by this checklist.");
    expect(checklist).toContain("Migrations `001` through `008` applied.");
    expect(checklist).toContain("Worker starts manually in PowerShell only.");
    expect(checklist).toContain("YouTube `videos.insert` absent.");

    expect(readme).toContain("docs/PRODUCTION_PILOT_PREFLIGHT.md");
    expect(readme).toContain("npm run preflight:production-pilot");
    expect(qa).toContain("Production Pilot QA");
    expect(qa).toContain("configured/missing/manual-check status only");
  });
});
