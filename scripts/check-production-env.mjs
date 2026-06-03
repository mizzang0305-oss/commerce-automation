#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_REPOSITORY_ADAPTER = "supabase";
const EXPECTED_STORAGE_BACKEND = "r2";

const REQUIRED_WEB_ENV = [
  "AUTOMATION_REPOSITORY_ADAPTER",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "WORKER_API_SECRET",
  "PUBLIC_APP_BASE_URL",
  "CONTENT_AI_PROVIDER"
];

const REQUIRED_WORKER_ENV = [
  "WEB_APP_BASE_URL",
  "WORKER_API_SECRET",
  "WORKER_ID",
  "WORKER_JOB_TYPES",
  "STORAGE_BACKEND"
];

const REQUIRED_R2_ENV = [
  "R2_ENDPOINT_URL",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_REGION",
  "R2_PUBLIC_BASE_URL_RENDERED_VIDEOS",
  "R2_PUBLIC_BASE_URL_THUMBNAILS",
  "R2_PUBLIC_BASE_URL_SUBTITLES",
  "R2_PUBLIC_BASE_URL_UPLOAD_PACKAGES"
];

const FORBIDDEN_PUBLIC_SECRET_ENV = [
  "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_WORKER_API_SECRET",
  "NEXT_PUBLIC_R2_SECRET_ACCESS_KEY",
  "NEXT_PUBLIC_OPENAI_API_KEY",
  "NEXT_PUBLIC_GEMINI_API_KEY",
  "NEXT_PUBLIC_COUPANG_SECRET_KEY"
];

export function buildProductionEnvReport(env = process.env) {
  const checks = [
    ...requiredChecks("web", REQUIRED_WEB_ENV, env),
    ...requiredChecks("worker", REQUIRED_WORKER_ENV, env),
    ...requiredChecks("r2", REQUIRED_R2_ENV, env),
    ...forbiddenPublicSecretChecks(env)
  ];

  const warnings = buildWarnings(env);
  const missingRequiredCount = checks.filter(
    (check) => check.kind === "required" && !check.configured
  ).length;
  const forbiddenConfiguredCount = checks.filter(
    (check) => check.kind === "forbidden" && check.configured
  ).length;
  const criticalWarningCount = warnings.filter((warning) => warning.severity === "critical").length;

  return {
    ok: missingRequiredCount === 0 && forbiddenConfiguredCount === 0 && criticalWarningCount === 0,
    summary: {
      required_configured: checks.filter((check) => check.kind === "required" && check.configured).length,
      required_total: checks.filter((check) => check.kind === "required").length,
      forbidden_configured: forbiddenConfiguredCount,
      warnings: warnings.length,
      critical_warnings: criticalWarningCount
    },
    checks,
    warnings,
    safety: {
      raw_values_printed: false,
      platform_upload_apis_enabled: false,
      webapp_launches_python_worker: false
    }
  };
}

function requiredChecks(group, keys, env) {
  return keys.map((key) => ({
    id: `${group}.${key.toLowerCase()}`,
    group,
    env: key,
    kind: "required",
    configured: hasValue(env[key])
  }));
}

function forbiddenPublicSecretChecks(env) {
  return FORBIDDEN_PUBLIC_SECRET_ENV.map((key) => ({
    id: `forbidden.${key.toLowerCase()}`,
    group: "forbidden_public_secret",
    env: key,
    kind: "forbidden",
    configured: hasValue(env[key])
  }));
}

function buildWarnings(env) {
  const warnings = [];
  const repositoryAdapter = normalized(env.AUTOMATION_REPOSITORY_ADAPTER);
  const storageBackend = normalized(env.STORAGE_BACKEND);
  const contentProvider = normalized(env.CONTENT_AI_PROVIDER || "template");
  const isProduction =
    normalized(env.NODE_ENV) === "production" || normalized(env.VERCEL_ENV) === "production";

  if (repositoryAdapter !== EXPECTED_REPOSITORY_ADAPTER) {
    warnings.push({
      code: "REPOSITORY_ADAPTER_NOT_SUPABASE",
      severity: "warning",
      message: "Set AUTOMATION_REPOSITORY_ADAPTER=supabase for shared production state."
    });
  }

  if (storageBackend !== EXPECTED_STORAGE_BACKEND) {
    warnings.push({
      code: "STORAGE_BACKEND_NOT_R2",
      severity: "warning",
      message: "Set STORAGE_BACKEND=r2 for the current four-bucket R2 production smoke path."
    });
  }

  if (isProduction && isTruthy(env.ENABLE_DEV_TOOLS)) {
    warnings.push({
      code: "DEV_TOOLS_ENABLED_IN_PRODUCTION",
      severity: "critical",
      message: "Leave ENABLE_DEV_TOOLS unset or false in normal production."
    });
  }

  if (contentProvider === "openai" && !hasValue(env.OPENAI_API_KEY)) {
    warnings.push({
      code: "OPENAI_PROVIDER_KEY_MISSING",
      severity: "warning",
      message: "CONTENT_AI_PROVIDER=openai requires a server-only OPENAI_API_KEY or template fallback."
    });
  }

  if (contentProvider === "gemini" && !hasValue(env.GEMINI_API_KEY)) {
    warnings.push({
      code: "GEMINI_PROVIDER_KEY_MISSING",
      severity: "warning",
      message: "CONTENT_AI_PROVIDER=gemini requires a server-only GEMINI_API_KEY or template fallback."
    });
  }

  if (!["template", "openai", "gemini", "disabled"].includes(contentProvider)) {
    warnings.push({
      code: "UNSUPPORTED_CONTENT_AI_PROVIDER",
      severity: "warning",
      message: "CONTENT_AI_PROVIDER should be template, openai, gemini, or disabled."
    });
  }

  if (isTruthy(env.YOUTUBE_UPLOAD_ENABLED) || isTruthy(env.PUBLIC_UPLOAD_ENABLED)) {
    warnings.push({
      code: "PUBLIC_UPLOAD_FLAG_ENABLED",
      severity: "critical",
      message: "Platform/public upload flags must remain disabled for this MVP."
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

function printPretty(report) {
  console.log(`production_env_ready=${report.ok}`);
  console.log(
    `required_configured=${report.summary.required_configured}/${report.summary.required_total}`
  );
  console.log(`forbidden_public_secrets_configured=${report.summary.forbidden_configured}`);
  console.log(`warnings=${report.summary.warnings}`);

  for (const check of report.checks) {
    const status =
      check.kind === "forbidden"
        ? check.configured
          ? "FAIL"
          : "OK"
        : check.configured
          ? "OK"
          : "MISSING";
    console.log(`${status} ${check.env}`);
  }

  for (const warning of report.warnings) {
    console.log(`${warning.severity.toUpperCase()} ${warning.code}: ${warning.message}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const report = buildProductionEnvReport(process.env);

  if (process.argv.includes("--pretty")) {
    printPretty(report);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  if (process.argv.includes("--strict") && !report.ok) {
    process.exitCode = 1;
  }
}
