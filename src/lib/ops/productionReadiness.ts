export type ProductionReadinessStatus = "ready" | "missing" | "manual_pending" | "blocked";
export type ProductionReadinessGroupStatus = "configured" | "missing" | "pending" | "ready" | "blocked";

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
  "supabase.migrations_001_008_applied",
  "supabase.rls_verified",
  "supabase.postgrest_reloaded",
  "r2.buckets_ready",
  "worker.python_312_ready",
  "worker.ffmpeg_ready",
  "smoke.operator_approval",
  "smoke.evidence_plan_ready"
];

const ENV_GROUPS = [
  envGroup("webapp_base", "WebApp Base", ["AUTOMATION_REPOSITORY_ADAPTER", "PUBLIC_APP_BASE_URL"]),
  envGroup("supabase", "Supabase", ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]),
  envGroup("webapp_runtime", "WebApp Runtime / AI", ["WORKER_API_SECRET", "CONTENT_AI_PROVIDER"]),
  envGroup("local_worker", "Local Python Worker", WORKER_REQUIRED_ENV),
  envGroup("r2", "Cloudflare R2", R2_REQUIRED_ENV)
];

const MANUAL_GROUPS = [
  manualGroup("vercel", "Vercel Readiness", ["vercel.project_selected", "vercel.node_build_confirmed"]),
  manualGroup("supabase", "Supabase Readiness", ["supabase.migrations_001_008_applied", "supabase.rls_verified", "supabase.postgrest_reloaded"]),
  manualGroup("r2", "R2 Readiness", ["r2.buckets_ready"]),
  manualGroup("local_worker", "Local Worker Readiness", ["worker.python_312_ready", "worker.ffmpeg_ready"]),
  manualGroup("rollback_approval", "Rollback / Approval", ["smoke.operator_approval", "smoke.evidence_plan_ready"])
];

export function buildProductionReadinessSummary(env: NodeJS.ProcessEnv = process.env) {
  const required = [...WEB_REQUIRED_ENV, ...WORKER_REQUIRED_ENV, ...R2_REQUIRED_ENV];
  const configured = required.filter((key) => hasValue(env[key])).length;
  const forbiddenConfigured = FORBIDDEN_PUBLIC_SECRETS.filter((key) => hasValue(env[key])).length;
  const missingRequired = required.length - configured;
  const manualPending = MANUAL_CHECKS.length;
  const platformUploadDisabled = !isTruthy(env.YOUTUBE_UPLOAD_ENABLED) && !isTruthy(env.PUBLIC_UPLOAD_ENABLED) && !isTruthy(env.UPLOAD_ENABLED);
  const manualUploadOnly = !isExplicitFalse(env.MANUAL_UPLOAD_ONLY);
  const explicitApprovalPresent = isTruthy(env.PRODUCTION_PILOT_APPROVED);
  const envGroups = buildEnvGroups(env);
  const manualGroups = buildManualGroups();
  const readinessFormula = {
    all_required_env_configured: missingRequired === 0,
    missing_required_zero: missingRequired === 0,
    forbidden_public_secrets_absent: forbiddenConfigured === 0,
    all_manual_checks_completed: manualPending === 0,
    explicit_approval_present: explicitApprovalPresent,
    deploy_command_not_executed: true,
    vercel_cli_not_invoked: true,
    raw_secret_values_not_printed: true,
    platform_upload_disabled: platformUploadDisabled,
    youtube_auto_upload_disabled: !isTruthy(env.YOUTUBE_UPLOAD_ENABLED),
    public_upload_disabled: !isTruthy(env.PUBLIC_UPLOAD_ENABLED),
    manual_upload_only: manualUploadOnly,
    production_pilot_ready:
      missingRequired === 0 &&
      forbiddenConfigured === 0 &&
      manualPending === 0 &&
      explicitApprovalPresent &&
      platformUploadDisabled &&
      manualUploadOnly
  };

  return {
    ok: true,
    production_pilot_ready: readinessFormula.production_pilot_ready,
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
    env_groups: envGroups,
    manual_groups: manualGroups,
    readiness_formula: readinessFormula,
    not_ready_reasons: buildNotReadyReasons({
      missingRequired,
      forbiddenConfigured,
      manualPending,
      explicitApprovalPresent,
      platformUploadDisabled,
      manualUploadOnly
    }),
    data_persistence: {
      migration_008_sql_verification_pass: true,
      artifact_qa_persistence_pass: true,
      artifact_qa_columns_verification_pass: true,
      artifact_qa_indexes_verification_pass: true,
      artifact_qa_rls_policy_verification_pass: true,
      smoke_row_verification_pass: true,
      production_pilot_ready_after_db_verification: false,
      note: "Migration 008 SQL verification passed. Production pilot remains approval-gated until env, deployment, and manual smoke evidence are complete."
    },
    safety: {
      deploy_command_executed: false,
      vercel_cli_invoked: false,
      raw_secret_values_printed: false,
      platform_upload_disabled: platformUploadDisabled,
      youtube_auto_upload_enabled: isTruthy(env.YOUTUBE_UPLOAD_ENABLED),
      public_upload_enabled: isTruthy(env.PUBLIC_UPLOAD_ENABLED),
      upload_enabled: isTruthy(env.UPLOAD_ENABLED),
      manual_upload_only: manualUploadOnly,
      oauth_token_storage_enabled: false,
      videos_insert_implemented: false
    },
    sections: [
      section("vercel", "Vercel", missingRequired > 0 ? "missing" : "manual_pending", "Project/env/deploy readiness is not completed."),
      section("supabase", "Supabase", "manual_pending", "Migrations/RLS/policies/schema reload must be confirmed manually."),
      section("data_persistence", "Data Persistence", "manual_pending", "Migration 008 artifact QA persistence verification is recorded, but production pilot approval is still required."),
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
      "production_diagnostics",
      "production_import_coupang",
      "production_next_batch",
      "youtube_auto_upload"
    ]
  };
}

function section(key: string, label: string, status: ProductionReadinessStatus, summary: string) {
  return { key, label, status, summary };
}

function envGroup(key: string, label: string, envKeys: string[]) {
  return { key, label, envKeys };
}

function manualGroup(key: string, label: string, checkKeys: string[]) {
  return { key, label, checkKeys };
}

function buildEnvGroups(env: NodeJS.ProcessEnv) {
  return ENV_GROUPS.map((group) => {
    const configured = group.envKeys.filter((key) => hasValue(env[key])).length;
    const missing = group.envKeys.length - configured;
    return {
      key: group.key,
      label: group.label,
      configured,
      required: group.envKeys.length,
      missing,
      status: (missing === 0 ? "configured" : "missing") as ProductionReadinessGroupStatus,
      env_keys: group.envKeys
    };
  });
}

function buildManualGroups() {
  return MANUAL_GROUPS.map((group) => ({
    key: group.key,
    label: group.label,
    completed: 0,
    pending: group.checkKeys.length,
    status: "pending" as ProductionReadinessGroupStatus,
    check_keys: group.checkKeys
  }));
}

function buildNotReadyReasons({
  missingRequired,
  forbiddenConfigured,
  manualPending,
  explicitApprovalPresent,
  platformUploadDisabled,
  manualUploadOnly
}: {
  missingRequired: number;
  forbiddenConfigured: number;
  manualPending: number;
  explicitApprovalPresent: boolean;
  platformUploadDisabled: boolean;
  manualUploadOnly: boolean;
}) {
  const reasons: string[] = [];
  if (missingRequired > 0) {
    reasons.push(`${missingRequired} required env values are still missing.`);
  }
  if (forbiddenConfigured > 0) {
    reasons.push(`${forbiddenConfigured} forbidden public secret env values are configured.`);
  }
  if (manualPending > 0) {
    reasons.push(`${manualPending} manual readiness checks remain pending.`);
  }
  if (!explicitApprovalPresent) {
    reasons.push("Explicit production pilot approval is not present.");
  }
  if (!platformUploadDisabled) {
    reasons.push("Platform or public upload flags are not disabled.");
  }
  if (!manualUploadOnly) {
    reasons.push("Manual upload only lock is not confirmed.");
  }
  return reasons;
}

function hasValue(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isTruthy(value: unknown) {
  return typeof value === "string" && ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isExplicitFalse(value: unknown) {
  return typeof value === "string" && ["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}
