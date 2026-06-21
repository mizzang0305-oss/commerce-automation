import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, resolve } from "node:path";

export const REQUIRED_ENV_KEYS = [
  "COMFYUI_WAN_I2V_ENABLED",
  "COMFYUI_BASE_URL",
  "COMFYUI_WAN_I2V_WORKFLOW_PATH",
  "COMFYUI_WAN_I2V_TIMEOUT_MS",
  "COMFYUI_WAN_I2V_POLL_INTERVAL_MS",
  "COMFYUI_WAN_I2V_OUTPUT_DIR"
];

export const REQUIRED_WORKFLOW_PLACEHOLDERS = [
  "{{PROMPT}}",
  "{{NEGATIVE_PROMPT}}",
  "{{SOURCE_IMAGE_PATH}}",
  "{{OUTPUT_PREFIX}}",
  "{{SEED}}",
  "{{DURATION_SECONDS}}",
  "{{WIDTH}}",
  "{{HEIGHT}}"
];

export function parseCliArgs(argv) {
  const args = {
    envFile: ".env.local"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--env-file") {
      args.envFile = argv[index + 1] ?? args.envFile;
      index += 1;
      continue;
    }
    if (arg.startsWith("--env-file=")) {
      args.envFile = arg.slice("--env-file=".length);
    }
  }

  return args;
}

export function buildConfigCheckReport(input = {}) {
  const cwd = input.cwd ?? process.cwd();
  const envFile = input.envFile ?? ".env.local";
  const envState = readEnvFile(envFile);
  const readiness = evaluateReadiness({
    cwd,
    env: envState.values,
    envFilePresent: envState.present
  });

  return {
    provider_enabled: readiness.provider_enabled,
    provider_configured: readiness.provider_configured,
    readiness_blocker: readiness.readiness_blocker,
    safe_summary: readiness.safe_summary
  };
}

export function evaluateReadiness(input) {
  const env = input.env ?? {};
  const enabledValue = nonEmpty(env.COMFYUI_WAN_I2V_ENABLED);
  const enabled = enabledValue === "true";
  const baseUrl = nonEmpty(env.COMFYUI_BASE_URL);
  const workflowPath = nonEmpty(env.COMFYUI_WAN_I2V_WORKFLOW_PATH);
  const outputDir = nonEmpty(env.COMFYUI_WAN_I2V_OUTPUT_DIR);
  const workflowPathIsRelative = workflowPath ? !isAbsolute(workflowPath) : null;
  const workflowBasename = workflowPath ? basename(workflowPath) : null;
  const workflowState = inspectWorkflowPath(workflowPath, input.cwd ?? process.cwd());

  const safe_summary = {
    env_file_present: Boolean(input.envFilePresent),
    enabled_present: enabledValue !== null,
    enabled_value_is_true: enabled,
    base_url_present: Boolean(baseUrl),
    workflow_path_present: Boolean(workflowPath),
    workflow_basename: workflowBasename,
    workflow_path_is_relative: workflowPathIsRelative,
    workflow_exists: workflowState.exists,
    workflow_json_valid: workflowState.jsonValid,
    output_dir_configured: Boolean(outputDir),
    output_dir_basename: outputDir ? basename(outputDir) : null
  };

  const readiness_blocker = resolveReadinessBlocker({
    enabled,
    baseUrlPresent: Boolean(baseUrl),
    workflowPathPresent: Boolean(workflowPath),
    workflowExists: workflowState.exists,
    workflowJsonValid: workflowState.jsonValid
  });

  return {
    provider_enabled: enabled,
    provider_configured: readiness_blocker === null,
    readiness_blocker,
    safe_summary
  };
}

export function readEnvFile(envFile) {
  if (!existsSync(envFile)) {
    return {
      present: false,
      values: {}
    };
  }

  const raw = readFileSync(envFile, "utf8");
  return {
    present: true,
    values: parseEnv(raw)
  };
}

export function parseEnv(raw) {
  const values = {};

  for (const originalLine of raw.split(/\r?\n/)) {
    const line = originalLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalizedLine = line.startsWith("export ") ? line.slice("export ".length).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = normalizedLine.slice(0, separatorIndex).trim();
    if (!REQUIRED_ENV_KEYS.includes(key)) continue;

    values[key] = unquote(normalizedLine.slice(separatorIndex + 1).trim());
  }

  return values;
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function resolveReadinessBlocker(input) {
  if (!input.enabled) return "COMFYUI_WAN_I2V_PROVIDER_DISABLED";
  if (!input.baseUrlPresent) return "COMFYUI_BASE_URL_MISSING";
  if (!input.workflowPathPresent) return "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING";
  if (!input.workflowExists) return "COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND";
  if (!input.workflowJsonValid) return "COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON";
  return null;
}

function inspectWorkflowPath(workflowPath, cwd) {
  if (!workflowPath) {
    return {
      exists: false,
      jsonValid: false
    };
  }

  const resolvedPath = isAbsolute(workflowPath) ? workflowPath : resolve(cwd, workflowPath);
  if (!existsSync(resolvedPath)) {
    return {
      exists: false,
      jsonValid: false
    };
  }

  return {
    exists: true,
    jsonValid: isValidWorkflowJson(readFileSync(resolvedPath, "utf8"))
  };
}

function isValidWorkflowJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    const serialized = JSON.stringify(parsed);
    return REQUIRED_WORKFLOW_PLACEHOLDERS.every((placeholder) => serialized.includes(placeholder));
  } catch {
    return false;
  }
}

function nonEmpty(value) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

function unquote(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
