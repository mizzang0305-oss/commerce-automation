import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, test } from "vitest";
import { COMMERCE_CONTROL_COOKIE, createCommerceControlSession } from "@/lib/commerce-control/auth";
import { requireMutationApi, resetMutationRateLimitsForTests } from "@/lib/commerce-control/api";

describe("daily69 control security boundary", () => {
  beforeEach(() => { process.env.COMMERCE_CONTROL_PASSWORD = "owner-password-123"; process.env.COMMERCE_CONTROL_SESSION_SECRET = "session-secret-at-least-thirty-two-characters"; resetMutationRateLimitsForTests(); });
  test("requires JSON and exact same-origin binding for authenticated mutations", () => {
    const cookie = `${COMMERCE_CONTROL_COOKIE}=${createCommerceControlSession()}`;
    const noOrigin = requireMutationApi(new Request("http://localhost/api/commerce-control/commands", { method: "POST", headers: { cookie, "Content-Type": "application/json" }, body: "{}" }));
    expect(noOrigin?.status).toBe(403);
    const crossOrigin = requireMutationApi(new Request("http://localhost/api/commerce-control/commands", { method: "POST", headers: { cookie, "Content-Type": "application/json", Origin: "https://evil.invalid" }, body: "{}" }));
    expect(crossOrigin?.status).toBe(403);
    const allowed = requireMutationApi(new Request("http://localhost/api/commerce-control/commands", { method: "POST", headers: { cookie, "Content-Type": "application/json", Origin: "http://localhost", "X-Request-ID": "request-12345678" }, body: "{}" }));
    expect(allowed).toBeNull();
  });

  test("contains no upload, post, arbitrary shell, DB, Drive-media executor path", async () => {
    const source = (await Promise.all(["src/lib/queue-control-integration/commandRunner.ts", "src/lib/queue-control-integration/projection.ts", "scripts/queue-control-integration/run-control-runner.ts"].map((path) => readFile(path, "utf8")))).join("\n");
    expect(source).not.toMatch(/videos\.insert|uploadVideo|drive\/v3|supabase|r2.*put|child_process|exec\(|spawn\(|shell/iu);
  });
});
