import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

const repoRoot = process.cwd();
const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("ComfyUI Wan local setup kit CLI", () => {
  test("setup doctor masks raw env values", () => {
    const root = tempRoot();
    const workflowPath = join(root, "sentinel-secret-workflow-name.json");
    writeFileSync(workflowPath, JSON.stringify(validWorkflowTemplate()), "utf8");
    const envFile = writeEnv(root, [
      "COMFYUI_WAN_I2V_ENABLED=true",
      "COMFYUI_BASE_URL=masked-local-base-value",
      `COMFYUI_WAN_I2V_WORKFLOW_PATH=${workflowPath}`,
      "COMFYUI_WAN_I2V_OUTPUT_DIR=C:\\very\\sensitive\\generated-motion"
    ]);

    const output = runJson("scripts/comfyui-wan-local-setup-doctor.mjs", ["--env-file", envFile]);
    const serialized = JSON.stringify(output);

    expect(output.safe_summary.workflow_basename).toBe("sentinel-secret-workflow-name.json");
    expect(output.safe_summary.workflow_exists).toBe(true);
    expect(serialized).not.toContain("masked-local-base-value");
    expect(serialized).not.toContain(workflowPath);
    expect(serialized).not.toContain("C:\\very\\sensitive");
  });

  test("config check returns disabled when key missing", () => {
    const envFile = writeEnv(tempRoot(), []);

    const output = runJson("scripts/comfyui-wan-local-config-check.mjs", ["--env-file", envFile]);

    expect(output).toMatchObject({
      provider_enabled: false,
      provider_configured: false,
      readiness_blocker: "COMFYUI_WAN_I2V_PROVIDER_DISABLED",
      safe_summary: {
        env_file_present: true,
        enabled_present: false,
        enabled_value_is_true: false
      }
    });
  });

  test("config check detects workflow path missing", () => {
    const envFile = writeEnv(tempRoot(), [
      "COMFYUI_WAN_I2V_ENABLED=true",
      "COMFYUI_BASE_URL=local-comfyui-base"
    ]);

    const output = runJson("scripts/comfyui-wan-local-config-check.mjs", ["--env-file", envFile]);

    expect(output).toMatchObject({
      provider_enabled: true,
      provider_configured: false,
      readiness_blocker: "COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING"
    });
  });

  test("config check detects workflow file missing", () => {
    const root = tempRoot();
    const missingWorkflow = join(root, "missing-workflow.json");
    const envFile = writeEnv(root, [
      "COMFYUI_WAN_I2V_ENABLED=true",
      "COMFYUI_BASE_URL=local-comfyui-base",
      `COMFYUI_WAN_I2V_WORKFLOW_PATH=${missingWorkflow}`
    ]);

    const output = runJson("scripts/comfyui-wan-local-config-check.mjs", ["--env-file", envFile]);

    expect(output).toMatchObject({
      provider_enabled: true,
      provider_configured: false,
      readiness_blocker: "COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND",
      safe_summary: {
        workflow_basename: "missing-workflow.json",
        workflow_exists: false
      }
    });
    expect(JSON.stringify(output)).not.toContain(root);
  });

  test("config check rejects invalid JSON", () => {
    const root = tempRoot();
    const workflowPath = join(root, "invalid-workflow.json");
    writeFileSync(workflowPath, "{not valid json", "utf8");
    const envFile = writeEnv(root, [
      "COMFYUI_WAN_I2V_ENABLED=true",
      "COMFYUI_BASE_URL=local-comfyui-base",
      `COMFYUI_WAN_I2V_WORKFLOW_PATH=${workflowPath}`
    ]);

    const output = runJson("scripts/comfyui-wan-local-config-check.mjs", ["--env-file", envFile]);

    expect(output).toMatchObject({
      provider_enabled: true,
      provider_configured: false,
      readiness_blocker: "COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON",
      safe_summary: {
        workflow_exists: true,
        workflow_json_valid: false
      }
    });
  });

  test("config check can report configured=true with valid dummy local workflow", () => {
    const root = tempRoot();
    const workflowPath = join(root, "valid-workflow.json");
    writeFileSync(workflowPath, JSON.stringify(validWorkflowTemplate()), "utf8");
    const envFile = writeEnv(root, [
      "COMFYUI_WAN_I2V_ENABLED=true",
      "COMFYUI_BASE_URL=local-comfyui-base",
      `COMFYUI_WAN_I2V_WORKFLOW_PATH=${workflowPath}`,
      "COMFYUI_WAN_I2V_OUTPUT_DIR=commerce-assets/generated-motion"
    ]);

    const output = runJson("scripts/comfyui-wan-local-config-check.mjs", ["--env-file", envFile]);

    expect(output).toMatchObject({
      provider_enabled: true,
      provider_configured: true,
      readiness_blocker: null,
      safe_summary: {
        workflow_basename: "valid-workflow.json",
        workflow_exists: true,
        workflow_json_valid: true,
        output_dir_configured: true
      }
    });
    expect(JSON.stringify(output)).not.toContain("local-comfyui-base");
  });

  test("dry-run smoke creates 3 scene briefs without server call", () => {
    const output = runJson("scripts/comfyui-wan-local-smoke-dry-run.mjs");

    expect(output).toMatchObject({
      smoke_only: true,
      server_called: false,
      workflow_submit_attempted: false,
      motion_clip_generation: false,
      requested_scene_count: 3
    });
    expect(output.scenes.map((scene: { scene_id: string }) => scene.scene_id)).toEqual([
      "scene-04-hand-pickup",
      "scene-05-cooking-use",
      "scene-06-product-rotate"
    ]);
  });

  test("dry-run prompts include no cartoon/vector/abstract negative rules", () => {
    const output = runJson("scripts/comfyui-wan-local-smoke-dry-run.mjs");

    expect(output.negative_prompt).toEqual(expect.stringContaining("no cartoon"));
    expect(output.negative_prompt).toEqual(expect.stringContaining("no vector"));
    expect(output.negative_prompt).toEqual(expect.stringContaining("no abstract"));
  });

  test("dry-run script does not contain forbidden ComfyUI endpoint calls", () => {
    const script = readFileSync("scripts/comfyui-wan-local-smoke-dry-run.mjs", "utf8");
    const output = runScript("scripts/comfyui-wan-local-smoke-dry-run.mjs");

    expect(script).not.toContain("/prompt");
    expect(script).not.toContain("/history");
    expect(script).not.toMatch(/\bfetch\s*\(/);
    expect(output).not.toContain("/prompt");
    expect(output).not.toContain("/history");
  });

  test(".env.local.comfyui.example contains placeholders only", () => {
    const envExample = readFileSync(".env.local.comfyui.example", "utf8");

    expect(envExample).toContain("COMFYUI_WAN_I2V_ENABLED=true");
    expect(envExample).toContain("COMFYUI_BASE_URL=http://127.0.0.1:8188");
    expect(envExample).toContain("COMFYUI_WAN_I2V_WORKFLOW_PATH=./config/comfyui/wan-i2v.workflow.local.json");
    expect(envExample).not.toMatch(/sk-|bearer|authorization|client_secret|refresh_token/i);
    expect(envExample).not.toMatch(/coupang\.com|affiliate|image_url|asset_url/i);
  });

  test("local workflow example has placeholders only", () => {
    const workflow = readFileSync("config/comfyui/wan-i2v.workflow.local.example.json", "utf8");
    const requiredPlaceholders = [
      "{{PROMPT}}",
      "{{NEGATIVE_PROMPT}}",
      "{{SOURCE_IMAGE_PATH}}",
      "{{OUTPUT_PREFIX}}",
      "{{SEED}}",
      "{{DURATION_SECONDS}}",
      "{{WIDTH}}",
      "{{HEIGHT}}"
    ];

    for (const placeholder of requiredPlaceholders) {
      expect(workflow).toContain(placeholder);
    }
    expect(workflow).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/mnt\/|\.safetensors|\.ckpt|token|secret/i);
  });

  test("docs state no YouTube/R2/DB side effects", () => {
    const docs = [
      "docs/COMFYUI_WAN_LOCAL_SETUP_RUNBOOK.md",
      "docs/COMFYUI_WAN_LOCAL_SMOKE_RUNBOOK.md",
      "docs/08_TEST_AND_QA_CHECKLIST.md",
      "docs/09_RELEASE_AND_ROADMAP.md"
    ].map((path) => readFileSync(path, "utf8")).join("\n");

    expect(docs).toContain("No YouTube Execute");
    expect(docs).toContain("No R2 upload/write");
    expect(docs).toContain("No DB write");
    expect(docs).toContain("No videos.insert");
  });
});

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), "comfyui-wan-local-"));
  tempRoots.push(root);
  return root;
}

function writeEnv(root: string, lines: string[]) {
  const envPath = join(root, "safe-test.env");
  writeFileSync(envPath, lines.join("\n"), "utf8");
  return envPath;
}

function runJson(script: string, args: string[] = []) {
  return JSON.parse(runScript(script, args));
}

function runScript(script: string, args: string[] = []) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      NO_COLOR: "1"
    }
  });
}

function validWorkflowTemplate() {
  return {
    metadata: {
      name: "local-test-placeholder"
    },
    nodes: {
      positive_prompt: {
        inputs: {
          text: "{{PROMPT}}"
        }
      },
      negative_prompt: {
        inputs: {
          text: "{{NEGATIVE_PROMPT}}"
        }
      },
      source_image: {
        inputs: {
          path: "{{SOURCE_IMAGE_PATH}}"
        }
      },
      output: {
        inputs: {
          prefix: "{{OUTPUT_PREFIX}}",
          seed: "{{SEED}}",
          duration_seconds: "{{DURATION_SECONDS}}",
          width: "{{WIDTH}}",
          height: "{{HEIGHT}}"
        }
      }
    }
  };
}
