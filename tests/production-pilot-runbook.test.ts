import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production pilot runbook", () => {
  test("prepares Vercel plus local Windows Worker without enabling deployment or uploads", () => {
    const runbook = readFileSync("docs/PRODUCTION_PILOT_RUNBOOK.md", "utf8");
    const vercelChecklist = readFileSync("checklists/vercel-production-checklist.md", "utf8");
    const workerChecklist = readFileSync("checklists/local-worker-production-checklist.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const qa = readFileSync("docs/08_TEST_AND_QA_CHECKLIST.md", "utf8");

    expect(runbook).toContain("Status: preparation guide only. No deployment is executed by this document.");
    expect(runbook).toContain("WebApp: Vercel-hosted Next.js service.");
    expect(runbook).toContain("Worker: local Windows Python Worker started by the operator.");
    expect(runbook).toContain("Do not implement or enable YouTube `videos.insert`.");
    expect(runbook).toContain("Keep `/api/run/next-batch` as the only worker-job creation path.");
    expect(runbook).toContain("Do not let the WebApp launch Python Worker.");
    expect(runbook).toContain("Do not put `SUPABASE_SERVICE_ROLE_KEY` in `python-worker/.env`.");
    expect(runbook).toContain("Passing this smoke does not mean platform upload is enabled.");
    expect(runbook).toContain("Stop the local Python Worker.");
    expect(runbook).toContain("`video_ready` without `video_url`");

    expect(vercelChecklist).toContain("Production deployment is explicitly approved before any deploy command is run.");
    expect(vercelChecklist).toContain("No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.");
    expect(vercelChecklist).toContain("WebApp does not launch Python Worker.");

    expect(workerChecklist).toContain("No `SUPABASE_SERVICE_ROLE_KEY`.");
    expect(workerChecklist).toContain("Worker is started manually by operator for first pilot.");
    expect(workerChecklist).toContain("Worker completion requires `video_url`.");

    expect(readme).toContain("docs/PRODUCTION_PILOT_RUNBOOK.md");
    expect(readme).toContain("checklists/vercel-production-checklist.md");
    expect(readme).toContain("checklists/local-worker-production-checklist.md");
    expect(qa).toContain("Production Pilot QA");
  });
});
