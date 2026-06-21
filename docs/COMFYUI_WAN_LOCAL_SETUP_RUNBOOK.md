# ComfyUI Wan Local Setup Runbook

This is a local setup kit, not a ComfyUI install PR. The repository adds safe
checks, examples, and runbooks only.

## Scope

- User installs and operates ComfyUI locally.
- User downloads or manages Wan I2V models outside this repository.
- User exports a working Wan I2V workflow JSON from ComfyUI.
- User enters local provider keys in `.env.local`.
- Codex does not install ComfyUI, download models, run GPU work, submit
  workflows, or generate clips in this setup kit.

## Local Files

1. Copy `.env.local.comfyui.example` values into `.env.local`, then edit them
   manually for the local machine.
2. Copy `config/comfyui/wan-i2v.workflow.local.example.json` to
   `config/comfyui/wan-i2v.workflow.local.json`.
3. Replace the local workflow copy with the user-exported ComfyUI workflow.
4. Keep generated clips and review reports under `commerce-assets/`.

The local workflow copy and generated artifact folders are ignored by Git.

## Required Readiness

Run:

```powershell
npm run comfyui:doctor
npm run comfyui:config-check
```

`provider_configured=true` requires:

- `COMFYUI_WAN_I2V_ENABLED=true`
- `COMFYUI_BASE_URL` present
- `COMFYUI_WAN_I2V_WORKFLOW_PATH` present
- workflow file exists
- workflow JSON is valid and includes the required placeholders

The scripts print booleans, basenames, and blocker codes only. They do not
print raw `.env.local` values, the raw ComfyUI base URL, tokens, secrets, or
full local workflow paths.

## Blockers

- `COMFYUI_WAN_I2V_PROVIDER_DISABLED`
- `COMFYUI_BASE_URL_MISSING`
- `COMFYUI_WAN_I2V_WORKFLOW_PATH_MISSING`
- `COMFYUI_WAN_I2V_WORKFLOW_NOT_FOUND`
- `COMFYUI_WAN_I2V_WORKFLOW_INVALID_JSON`
- `COMFYUI_WAN_I2V_PROVIDER_NOT_CONFIGURED`

## Safety

- No YouTube Execute.
- No videos.insert.
- No R2 upload/write.
- No DB write.
- No migration.
- No production deploy.
- No public upload.
- No unlisted upload.
- No ComfyUI install.
- No model download.
- No GPU execution.
- No workflow submit.
- No motion clip generation.

## Next Step

When config check reports `provider_configured=true`, run only the separately
approved local smoke prompt. The next stage is local evidence collection and
human review, not upload.
