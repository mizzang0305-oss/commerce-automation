import { describe, expect, test } from "vitest";
import { GET } from "../app/api/ops/production-readiness/route";

describe("ops production readiness API", () => {
  test("returns approval-gated safe readiness summary without raw secret values", async () => {
    const originalEnv = process.env;
    process.env = {
      ...originalEnv,
      AUTOMATION_REPOSITORY_ADAPTER: "supabase",
      SUPABASE_URL: "https://secret-project.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "supabase-secret-value",
      WORKER_API_SECRET: "worker-secret-value",
      PUBLIC_APP_BASE_URL: "https://app.example.com",
      CONTENT_AI_PROVIDER: "template"
    };

    try {
      const response = await GET();
      const payload = await response.json();
      const serialized = JSON.stringify(payload);

      expect(response.status).toBe(200);
      expect(payload).toMatchObject({
        ok: true,
        production_pilot_ready: false,
        approval_required: true,
        safety: {
          deploy_command_executed: false,
          vercel_cli_invoked: false,
          raw_secret_values_printed: false,
          platform_upload_disabled: true,
          youtube_auto_upload_enabled: false,
          public_upload_enabled: false
        }
      });
      expect(payload.env.required).toBeGreaterThan(0);
      expect(payload.env.required).toBe(19);
      expect(payload.env_groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "webapp_base", label: "WebApp Base" }),
          expect.objectContaining({ key: "supabase", label: "Supabase" }),
          expect.objectContaining({ key: "webapp_runtime", label: "WebApp Runtime / AI" }),
          expect.objectContaining({ key: "local_worker", label: "Local Python Worker" }),
          expect.objectContaining({ key: "r2", label: "Cloudflare R2" })
        ])
      );
      expect(payload.env_groups.reduce((total: number, group: { required: number }) => total + group.required, 0)).toBe(19);
      expect(payload.manual_groups).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: "vercel", label: "Vercel Readiness" }),
          expect.objectContaining({ key: "supabase", label: "Supabase Readiness" }),
          expect.objectContaining({ key: "r2", label: "R2 Readiness" }),
          expect.objectContaining({ key: "local_worker", label: "Local Worker Readiness" }),
          expect.objectContaining({ key: "rollback_approval", label: "Rollback / Approval" })
        ])
      );
      expect(payload.manual_groups.reduce((total: number, group: { pending: number }) => total + group.pending, 0)).toBe(10);
      expect(payload.readiness_formula).toMatchObject({
        all_required_env_configured: false,
        forbidden_public_secrets_absent: true,
        all_manual_checks_completed: false,
        explicit_approval_present: false,
        deploy_command_not_executed: true,
        vercel_cli_not_invoked: true,
        raw_secret_values_not_printed: true,
        platform_upload_disabled: true,
        youtube_auto_upload_disabled: true,
        public_upload_disabled: true,
        manual_upload_only: true,
        production_pilot_ready: false
      });
      expect(payload.data_persistence).toEqual(
        expect.objectContaining({
          migration_008_sql_verification_pass: true,
          artifact_qa_persistence_pass: true,
          artifact_qa_columns_verification_pass: true,
          artifact_qa_indexes_verification_pass: true,
          artifact_qa_rls_policy_verification_pass: true,
          smoke_row_verification_pass: true
        })
      );
      expect(payload.sections.map((section: { key: string }) => section.key)).toEqual(
        expect.arrayContaining(["vercel", "supabase", "r2", "local_worker", "data_persistence"])
      );
      expect(serialized).not.toContain("supabase-secret-value");
      expect(serialized).not.toContain("worker-secret-value");
      expect(serialized).not.toContain("secret-project.supabase.co");
    } finally {
      process.env = originalEnv;
    }
  });
});
