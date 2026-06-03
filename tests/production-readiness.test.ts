import { spawnSync } from "node:child_process";
import { describe, expect, test } from "vitest";

const script = "scripts/check-production-env.mjs";

describe("production env readiness helper", () => {
  test("reports missing env as safe warnings without raw values", () => {
    const result = runReadinessScript({
      NODE_ENV: "production"
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(false);
    expect(payload.summary.required_configured).toBe(0);
    expect(payload.warnings.some((warning: { code: string }) => warning.code === "REPOSITORY_ADAPTER_NOT_SUPABASE")).toBe(true);
    expect(result.stdout).not.toContain("secret-value");
  });

  test("passes a complete Supabase and R2 production env without printing secret values", () => {
    const result = runReadinessScript({
      NODE_ENV: "production",
      AUTOMATION_REPOSITORY_ADAPTER: "supabase",
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-value",
      WORKER_API_SECRET: "worker-secret-value",
      PUBLIC_APP_BASE_URL: "https://app.example.com",
      CONTENT_AI_PROVIDER: "template",
      WEB_APP_BASE_URL: "https://app.example.com",
      WORKER_ID: "production-worker-01",
      WORKER_JOB_TYPES: "video_render,sheet_sync",
      STORAGE_BACKEND: "r2",
      R2_ENDPOINT_URL: "https://account.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "r2-access-key-value",
      R2_SECRET_ACCESS_KEY: "r2-secret-value",
      R2_REGION: "auto",
      R2_PUBLIC_BASE_URL_RENDERED_VIDEOS: "https://video.example.com",
      R2_PUBLIC_BASE_URL_THUMBNAILS: "https://thumbnail.example.com",
      R2_PUBLIC_BASE_URL_SUBTITLES: "https://subtitle.example.com",
      R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES: "https://package.example.com"
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.ok).toBe(true);
    expect(payload.summary.required_configured).toBe(payload.summary.required_total);
    expect(payload.summary.forbidden_configured).toBe(0);
    expect(payload.warnings).toHaveLength(0);
    expect(result.stdout).not.toContain("supabase-secret-value");
    expect(result.stdout).not.toContain("worker-secret-value");
    expect(result.stdout).not.toContain("r2-secret-value");
    expect(result.stdout).not.toContain("https://project.supabase.co");
  });

  test("warns when production dev tools or provider config is unsafe", () => {
    const result = runReadinessScript({
      NODE_ENV: "production",
      ENABLE_DEV_TOOLS: "true",
      AUTOMATION_REPOSITORY_ADAPTER: "local-json",
      STORAGE_BACKEND: "local",
      CONTENT_AI_PROVIDER: "openai",
      YOUTUBE_UPLOAD_ENABLED: "true"
    });

    const payload = JSON.parse(result.stdout);
    const codes = payload.warnings.map((warning: { code: string }) => warning.code);

    expect(codes).toContain("DEV_TOOLS_ENABLED_IN_PRODUCTION");
    expect(codes).toContain("REPOSITORY_ADAPTER_NOT_SUPABASE");
    expect(codes).toContain("STORAGE_BACKEND_NOT_R2");
    expect(codes).toContain("OPENAI_PROVIDER_KEY_MISSING");
    expect(codes).toContain("PUBLIC_UPLOAD_FLAG_ENABLED");
  });

  test("flags NEXT_PUBLIC secret env names without printing values", () => {
    const result = runReadinessScript({
      NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "public-service-role-secret",
      NEXT_PUBLIC_R2_SECRET_ACCESS_KEY: "public-r2-secret"
    });

    const payload = JSON.parse(result.stdout);
    const forbidden = payload.checks.filter(
      (check: { kind: string; configured: boolean }) => check.kind === "forbidden" && check.configured
    );

    expect(forbidden).toHaveLength(2);
    expect(payload.summary.forbidden_configured).toBe(2);
    expect(result.stdout).not.toContain("public-service-role-secret");
    expect(result.stdout).not.toContain("public-r2-secret");
  });
});

function runReadinessScript(env: Record<string, string>) {
  return spawnSync("node", [script], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      COMSPEC: process.env.COMSPEC,
      ...env
    },
    encoding: "utf8"
  });
}
