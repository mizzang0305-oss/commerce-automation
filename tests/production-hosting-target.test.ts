import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("production hosting target decision", () => {
  test("documents the first safe MVP target without executing deployment or uploads", () => {
    const decision = readFileSync("docs/PRODUCTION_HOSTING_DECISION.md", "utf8");
    const checklist = readFileSync("checklists/production-hosting-target-checklist.md", "utf8");
    const readme = readFileSync("README.md", "utf8");
    const roadmap = readFileSync("docs/09_RELEASE_AND_ROADMAP.md", "utf8");

    expect(decision).toContain("Status: decision package, no deployment executed.");
    expect(decision).toContain("WebApp: Vercel-hosted Next.js service.");
    expect(decision).toContain("Python Worker: operator-controlled Windows machine");
    expect(decision).toContain("Supabase/Postgres");
    expect(decision).toContain("Cloudflare R2");
    expect(decision).toContain("YouTube `videos.insert`");
    expect(decision).toContain("TikTok Direct Post");
    expect(decision).toContain("Threads post");
    expect(decision).toContain("ViMax dependency");
    expect(decision).toContain("External video/image API calls");

    expect(checklist).toContain("Production deploy not executed before this checklist is approved.");
    expect(checklist).toContain("Worker is started outside WebApp.");
    expect(checklist).toContain("Worker does not contain `SUPABASE_SERVICE_ROLE_KEY`.");
    expect(checklist).toContain("Confirm content generation creates zero worker jobs.");
    expect(checklist).toContain("Confirm `next-batch` creates one `video_render` job.");
    expect(checklist).toContain("Confirm `upload_enabled=false`.");
    expect(checklist).toContain("Confirm `manual_upload_only=true`.");

    expect(readme).toContain("docs/PRODUCTION_HOSTING_DECISION.md");
    expect(readme).toContain("checklists/production-hosting-target-checklist.md");
    expect(roadmap).toContain("Recommendation: Vercel WebApp, local Windows Python Worker");
  });
});
