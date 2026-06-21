#!/usr/bin/env node

import { spawnSync } from "node:child_process";

import {
  buildConfigCheckReport,
  parseCliArgs,
  printJson
} from "./comfyui-wan-local-utils.mjs";

const args = parseCliArgs(process.argv.slice(2));
const configCheck = buildConfigCheckReport({ envFile: args.envFile });

printJson({
  setup_doctor: true,
  node_available: true,
  npm_available: npmAvailable(),
  provider_enabled: configCheck.provider_enabled,
  provider_configured: configCheck.provider_configured,
  readiness_blocker: configCheck.readiness_blocker,
  safe_summary: configCheck.safe_summary,
  safety: {
    comfyui_install: false,
    model_download: false,
    gpu_execution: false,
    workflow_submit: false,
    motion_clip_generation: false,
    youtube_execute: false,
    videos_insert: false,
    r2_upload_write: false,
    db_write: false
  },
  next_action: nextAction(configCheck)
});

function npmAvailable() {
  if (commandAvailable("npm")) return true;
  if (process.platform === "win32") return commandAvailable("where", ["npm"]);
  return false;
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, spawnOptions());
  return result.status === 0;
}

function spawnOptions() {
  return {
    encoding: "utf8",
    stdio: "pipe",
    windowsHide: true
  };
}

function nextAction(configCheck) {
  if (configCheck.provider_configured) {
    return "Run local smoke prompt only after explicit local smoke approval.";
  }

  return "Manually configure local ComfyUI/Wan workflow keys, then rerun config check.";
}
