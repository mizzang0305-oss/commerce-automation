export type ProductionReadinessStatus = "ready" | "missing" | "manual_pending" | "blocked";

const WEB_REQUIRED_ENV = [
  "AUTOMATION_REPOSITORY_ADAPTER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WORKER_API_SECRET",
  "PUBLIC_APP_BASE_URL",
  "CONTENT_AI_PROVIDER"
];

const WORKER_REQUIRED_ENV = [
  "WEB_APP_BASE_URL",
  "WORKER_API_SECRET",
  "WORKER_ID",
  "WORKER_JOB_TYPES",
  "STORAGE_BACKEND"
];

const R2_REQUIRED_ENV = [
  "R2_ENDPOINT_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_REGION",
  "R2_PUBLIC_BASE_URL_RENDERED_VIDEOS",
  "R2_PUBLIC_BASE_URL_THUMBNAILS",
  "R2_PUBLIC_BASE_URL_SUBTITLES",
  "R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES"
];

const FORBIDDEN_PUBLIC_SECRETS = [
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_WORKER_API_SECRET",
  "NEXT_PUBLIC_R2_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_OPENAI_API_KEY",
  "NEXT_PUBLIC_GEMINI_API_KEY",
  "NEXT_PUBLIC_COUPANG_SECRET_KEY"
];

const MANUAL_CHECKS = [
  "vercel.project_selected",
  "vercel.node_build_confirmed",
  "supabase.migrations_001_007_applied",
  "supabase.rls_verified",
  "supabase.postgrest_reloaded",
  "r2.buckets_ready",
  "worker.python_312_ready",
  "worker.ffmpeg_ready",
  "smoke.operator_approval",
  "smoke.evidence_plan_ready"
];

export function buildProductionReadinessSummary(env: NodeJS.ProcessEnv = process.env) {
  const required = [...WEB_REQUIRED_ENV, ...WORKER_REQUIRED_ENV, ...R2_REQUIRED_ENV];
  const configured = required.filter((key) => hasValue(env[key])).length;
  const forbiddenConfigured = FORBIDDEN_PUBLIC_SECRETS.filter((key) => hasValue(env[key])).length;
  const missingRequired = required.length - configured;
  const manualPending = MANUAL_CHECKS.length;
  const platformUploadDisabled = !isTruthy(env.YOUTUBE_UPLOAD_ENABLED) && !isTruthy(env.PUBLIC_UPLOAD_ENABLED);

  return {
    ok: true,
    production_pilot_ready: false,
    approval_required: true,
    env: {
      configured,
      required: required.length,
      missing_required: missingRequired,
      forbidden_configured: forbiddenConfigured
    },
    manual: {
      pending: manualPending,
      completed: 0
    },
    safety: {
      deploy_command_executed: false,
      vercel_cli_invoked: false,
      raw_secret_values_printed: false,
      platform_upload_disabled: platformUploadDisabled,
      youtube_auto_upload_enabled: isTruthy(env.YOUTUBE_UPLOAD_ENABLED),
      public_upload_enabled: isTruthy(env.PUBLIC_UPLOAD_ENABLED)
    },
    sections: [
      section("vercel", "Vercel", missingRequired > 0 ? "missing" : "manual_pending", "Project/env/deploy readiness is not completed."),
      section("supabase", "Supabase", "manual_pending", "Migrations/RLS/policies/schema reload must be confirmed manually."),
      section("r2", "Cloudflare R2", "manual_pending", "Bucket/public URL/artifact path readiness must be confirmed manually."),
      section("local_worker", "Local Python Worker", "manual_pending", "Python 3.12, venv, ffmpeg, R2 env, and manual PowerShell start must be confirmed.")
    ],
    next_allowed_actions: [
      "ops_dashboard_refinement",
      "coupang_collector_mvp",
      "worker_artifact_qa_dashboard"
    ],
    blocked_actions: [
      "vercel_project_creation",
      "vercel_env_input",
      "vercel_deploy",
      "production_smoke",
      "youtube_auto_upload"
    ]
  };
}

function section(key: string, label: string, status: ProductionReadinessStatus, summary: string) {
  return { key, label, status, summary };
}

function hasValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isTruthy(value: unknown) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}
