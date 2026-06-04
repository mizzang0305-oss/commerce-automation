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
    expect(report.safety.deploy_command_executed).toBe(false);
    expect(report.safety.vercel_cli_invoked).toBe(false);
    expect(report.safety.supabase_cli_invoked).toBe(false);
    expect(report.safety.r2_network_call_executed).toBe(false);
    expect(output).toContain("production_pilot_preflight_ready=false");
    expect(output).toContain("approval_required=true");
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
    expect(doc).toContain("npm run preflight:production-pilot");
    expect(doc).toContain("The preflight checks only readiness inputs.");
    expect(doc).toContain("The preflight script does not contact R2.");
    expect(doc).toContain("The WebApp must not launch Python Worker.");
    expect(doc).toContain("Passing smoke still does not enable YouTube, TikTok, Threads");
    expect(doc).toContain("Do not report PASS when artifact upload, worker completion, or `video_url` verification is missing.");

    expect(checklist).toContain("Operator explicitly approved the production pilot timing.");
    expect(checklist).toContain("No deploy command has been run by this checklist.");
    expect(checklist).toContain("Migrations `001` through `007` applied.");
    expect(checklist).toContain("Worker starts manually in PowerShell only.");
    expect(checklist).toContain("YouTube `videos.insert` absent.");

    expect(readme).toContain("docs/PRODUCTION_PILOT_PREFLIGHT.md");
    expect(readme).toContain("npm run preflight:production-pilot");
    expect(qa).toContain("Production Pilot QA");
    expect(qa).toContain("configured/missing/manual-check status only");
  });
});
