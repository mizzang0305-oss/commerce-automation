import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  ["vercel.project_selected", "Vercel project selected and linked to GitHub."],
  ["vercel.node_build_confirmed", "Vercel build command and Node runtime reviewed."],
  ["supabase.migrations_001_008_applied", "Supabase migrations 001 through 008 applied, including artifact QA persistence."],
  ["supabase.rls_verified", "Supabase RLS enabled and broad public policies absent."],
  ["supabase.postgrest_reloaded", "PostgREST schema cache reloaded after migrations."],
  ["r2.buckets_ready", "R2 buckets and bucket-specific public base URLs prepared."],
  ["worker.python_312_ready", "Local Windows Worker uses Python 3.12.x with requirements installed."],
  ["worker.ffmpeg_ready", "ffmpeg or imageio-ffmpeg fallback verified."],
  ["smoke.operator_approval", "Operator approval received before deployment or production smoke."],
  ["smoke.evidence_plan_ready", "Evidence capture plan prepared without raw secrets."]
];

export function buildProductionPilotPreflightReport(env = process.env) {
  const checks = [
    ...envChecks("vercel_webapp_env", WEB_REQUIRED_ENV, env),
    ...envChecks("local_worker_env", WORKER_REQUIRED_ENV, env),
    ...envChecks("r2_env", R2_REQUIRED_ENV, env),
    ...forbiddenChecks(env),
    ...manualChecks()
  ];

  const warnings = buildWarnings(env);
  const missingRequired = checks.filter(
    (check) => check.kind === "required_env" && check.status === "missing"
  ).length;
  const forbiddenConfigured = checks.filter(
    (check) => check.kind === "forbidden_env" && check.status === "blocked"
  ).length;
  const manualPending = checks.filter((check) => check.status === "manual_check").length;
  const criticalWarnings = warnings.filter((warning) => warning.severity === "critical").length;

  return {
    ok: false,
    ready_for_deploy: false,
    approval_required: true,
    summary: {
      configured_env: checks.filter(
        (check) => check.kind === "required_env" && check.status === "configured"
      ).length,
      required_env_total: checks.filter((check) => check.kind === "required_env").length,
      missing_required: missingRequired,
      forbidden_configured: forbiddenConfigured,
      manual_pending: manualPending,
      warnings: warnings.length,
      critical_warnings: criticalWarnings
    },
    checks,
    warnings,
    safety: {
      raw_values_printed: false,
      deploy_command_executed: false,
      vercel_cli_invoked: false,
      supabase_cli_invoked: false,
      r2_network_call_executed: false,
      platform_upload_apis_enabled: false,
      oauth_token_storage_enabled: false,
      webapp_launches_python_worker: false
    }
  };
}

export function formatPreflightReport(report) {
  const lines = [
    `production_pilot_preflight_ready=${report.ready_for_deploy}`,
    `approval_required=${report.approval_required}`,
    `configured_env=${report.summary.configured_env}/${report.summary.required_env_total}`,
    `missing_required=${report.summary.missing_required}`,
    `forbidden_configured=${report.summary.forbidden_configured}`,
    `manual_pending=${report.summary.manual_pending}`,
    `warnings=${report.summary.warnings}`
  ];

  for (const check of report.checks) {
    lines.push(`${check.status.toUpperCase()} ${check.group} ${check.name}`);
  }

  for (const warning of report.warnings) {
    lines.push(`${warning.severity.toUpperCase()} ${warning.code}: ${warning.message}`);
  }

  lines.push("DEPLOY_COMMAND_EXECUTED false");
  lines.push("VERCEL_CLI_INVOKED false");
  lines.push("RAW_SECRET_VALUES_PRINTED false");
  return `${lines.join("\n")}\n`;
}

function envChecks(group, keys, env) {
  return keys.map((name) => ({
    group,
    name,
    kind: "required_env",
    status: hasValue(env[name]) ? "configured" : "missing"
  }));
}

function forbiddenChecks(env) {
  return FORBIDDEN_PUBLIC_SECRETS.map((name) => ({
    group: "forbidden_public_secret",
    name,
    kind: "forbidden_env",
    status: hasValue(env[name]) ? "blocked" : "ok"
  }));
}

function manualChecks() {
  return MANUAL_CHECKS.map(([name, description]) => ({
    group: "manual_preflight",
    name,
    kind: "manual",
    status: "manual_check",
    description
  }));
}

function buildWarnings(env) {
  const warnings = [];

  if (normalized(env.AUTOMATION_REPOSITORY_ADAPTER) !== "supabase") {
    warnings.push({
      code: "REPOSITORY_ADAPTER_NOT_SUPABASE",
      severity: "warning",
      message: "Production pilot expects AUTOMATION_REPOSITORY_ADAPTER=supabase."
    });
  }

  if (normalized(env.STORAGE_BACKEND) !== "r2") {
    warnings.push({
      code: "STORAGE_BACKEND_NOT_R2",
      severity: "warning",
      message: "Production pilot expects STORAGE_BACKEND=r2 for real artifact storage."
    });
  }

  if (isTruthy(env.ENABLE_DEV_TOOLS)) {
    warnings.push({
      code: "DEV_TOOLS_ENABLED",
      severity: "critical",
      message: "Normal production pilot should keep ENABLE_DEV_TOOLS unset or false."
    });
  }

  if (isTruthy(env.YOUTUBE_UPLOAD_ENABLED) || isTruthy(env.PUBLIC_UPLOAD_ENABLED)) {
    warnings.push({
      code: "UPLOAD_FLAG_ENABLED",
      severity: "critical",
      message: "Platform/public upload flags must remain disabled."
    });
  }

  if (isTruthy(env.PRODUCTION_DEPLOY_APPROVED)) {
    warnings.push({
      code: "APPROVAL_FLAG_IS_INFORMATIONAL_ONLY",
      severity: "warning",
      message: "This script records readiness only and never runs deployment or smoke commands."
    });
  }

  return warnings;
}

function hasValue(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalized(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes(normalized(value));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = buildProductionPilotPreflightReport(process.env);
  console.log(formatPreflightReport(report));

  if (process.argv.includes("--strict") && report.summary.critical_warnings > 0) {
    process.exitCode = 1;
  }
}
