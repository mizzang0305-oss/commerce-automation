import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioServerBridge } from "@/lib/commerce-studio/bridge/serverStore";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Commerce Studio server schema routing", () => {
  it("keeps the reference SQL private and schema-qualified", () => {
    const migration = readFileSync(resolve("supabase/migrations/011_commerce_studio_bridge.sql"), "utf8");
    expect(migration).not.toMatch(/public\.commerce_studio_(?:bridge|compare_swap)/iu);
    expect(migration).toMatch(/create schema commerce_studio authorization postgres/iu);
    expect(migration).not.toMatch(/create schema if not exists|create or replace function/iu);
    expect(migration).toMatch(/force row level security/iu);
    expect(migration).toMatch(/security invoker set search_path = ''/iu);
    expect(migration).toMatch(/grant select, insert, update on commerce_studio\.commerce_studio_bridge to service_role/iu);
    expect(migration).toMatch(/STUDIO_SCHEMA_UNTRUSTED_PRIVILEGE_ASSERTION_FAILED/u);
    expect(migration).not.toMatch(/grant .* on .*commerce_studio_.* to (?:anon|authenticated)/iu);
  });

  it("uses only the isolated schema for the durable read and CAS RPC", async () => {
    vi.stubEnv("STUDIO_ENVIRONMENT_ID", "fixture-preview");
    vi.stubEnv("STUDIO_OWNER_GOOGLE_SUB", "fixture-owner-sub");
    vi.stubEnv("STUDIO_HOST_ID", "fixture-host");
    vi.stubEnv("STUDIO_HOST_HMAC_SECRET", "x".repeat(32));
    vi.stubEnv("STUDIO_EXPECTED_RUNTIME_SHA", "a".repeat(40));
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "fixture-only-not-a-secret");

    const requests: Array<{ path: string; method: string; headers: Headers }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(input, init);
      requests.push({ path: new URL(request.url).pathname, method: request.method, headers: request.headers });
      return new Response(request.method === "POST" ? "true" : "[]", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }));

    const server = createStudioServerBridge();
    expect(server).not.toBeNull();
    expect(await server!.bridge.read("fixture-owner-sub")).toBeNull();
    expect(await server!.bridge.ingest({
      schemaVersion: 1,
      environmentId: "fixture-preview",
      hostId: "fixture-host",
      ownerId: "fixture-owner-sub",
      sourceRuntimeSha: "a".repeat(40),
      sourceSequence: 1,
      eventId: randomUUID(),
      observedAt: "2026-09-23T00:00:00.000Z",
      sourceRevision: "fixture-revision",
      completeness: { producer: false, publisher: true, plans: false, candidates: false },
      payload: { producer: null, publisher: { jobs: [], ledger: [] }, plans: null, candidates: null }
    })).toBe("accepted");

    const reads = requests.filter((request) => request.path === "/rest/v1/commerce_studio_bridge");
    const writes = requests.filter((request) => request.path === "/rest/v1/rpc/commerce_studio_compare_swap");
    expect(reads.length).toBeGreaterThan(0);
    expect(writes).toHaveLength(1);
    expect(reads.every((request) => request.method === "GET" && request.headers.get("accept-profile") === "commerce_studio")).toBe(true);
    expect(writes[0].method).toBe("POST");
    expect(writes[0].headers.get("content-profile")).toBe("commerce_studio");
  });
});
