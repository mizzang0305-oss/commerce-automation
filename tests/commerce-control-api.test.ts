import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { GET as getQueue } from "../app/api/commerce-control/queue/route";
import { GET as getQueueItem, PATCH as patchQueueItem } from "../app/api/commerce-control/queue/[queueId]/route";
import { GET as getCommands, POST as postCommand } from "../app/api/commerce-control/commands/route";
import { PATCH as patchCommand } from "../app/api/commerce-control/commands/[commandId]/route";
import { GET as getLogs } from "../app/api/commerce-control/logs/route";
import { GET as getSettings, PATCH as patchSettings } from "../app/api/commerce-control/settings/route";
import { GET as getHealth } from "../app/api/commerce-control/health/route";
import { GET as getDashboard } from "../app/api/commerce-control/dashboard/route";
import { COMMERCE_CONTROL_COOKIE, createCommerceControlSession } from "@/lib/commerce-control/auth";
import { createCommerceControlRepository, resetCommerceControlRepositoryForTests, setCommerceControlRepositoryForTests } from "@/lib/google-sheets/commerceControlRepository";
import { MemorySheetsGateway, freshQueueLastModified } from "./helpers/googleSheetsControl";

function request(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("cookie", `${COMMERCE_CONTROL_COOKIE}=${createCommerceControlSession()}`);
  if (init.body) headers.set("Content-Type", "application/json");
  return new Request(url, { ...init, headers });
}

describe("commerce control API", () => {
  let gateway: MemorySheetsGateway;
  beforeEach(() => {
    process.env.COMMERCE_CONTROL_PASSWORD = "owner-password-123";
    process.env.COMMERCE_CONTROL_SESSION_SECRET = "session-secret-at-least-thirty-two-characters";
    gateway = new MemorySheetsGateway();
    setCommerceControlRepositoryForTests(createCommerceControlRepository(gateway));
  });
  afterEach(() => {
    resetCommerceControlRepositoryForTests();
    delete process.env.COMMERCE_CONTROL_PASSWORD;
    delete process.env.COMMERCE_CONTROL_SESSION_SECRET;
  });

  test("rejects unauthenticated requests on every control API surface", async () => {
    const plain = (path: string, init: RequestInit = {}) => new Request(`http://localhost${path}`, init);
    const responses = await Promise.all([
      getDashboard(plain("/api/commerce-control/dashboard")),
      getQueue(plain("/api/commerce-control/queue")),
      getQueueItem(plain("/api/commerce-control/queue/queue-001"), { params: Promise.resolve({ queueId: "queue-001" }) }),
      patchQueueItem(plain("/api/commerce-control/queue/queue-001", { method: "PATCH" }), { params: Promise.resolve({ queueId: "queue-001" }) }),
      getCommands(plain("/api/commerce-control/commands")), postCommand(plain("/api/commerce-control/commands", { method: "POST" })),
      patchCommand(plain("/api/commerce-control/commands/command-001", { method: "PATCH" }), { params: Promise.resolve({ commandId: "command-001" }) }),
      getLogs(plain("/api/commerce-control/logs")), getSettings(plain("/api/commerce-control/settings")),
      patchSettings(plain("/api/commerce-control/settings", { method: "PATCH" })), getHealth(plain("/api/commerce-control/health"))
    ]);
    expect(responses.every((response) => response.status === 401)).toBe(true);
  });

  test("lists and reads queue rows without the example row", async () => {
    const list = await getQueue(request("http://localhost/api/commerce-control/queue"));
    const detail = await getQueueItem(request("http://localhost/api/commerce-control/queue/queue-001"), { params: Promise.resolve({ queueId: "queue-001" }) });
    expect(list.status).toBe(200);
    expect((await list.json()).items).toHaveLength(1);
    expect((await detail.json()).item).toMatchObject({ queueId: "queue-001" });
  });

  test("updates a queue row and returns 409 for a stale value", async () => {
    const ok = await patchQueueItem(request("http://localhost/api/commerce-control/queue/queue-001", {
      method: "PATCH", body: JSON.stringify({ productName: "API 수정", expectedLastModified: freshQueueLastModified(gateway) })
    }), { params: Promise.resolve({ queueId: "queue-001" }) });
    expect(ok.status).toBe(200);
    const stale = await patchQueueItem(request("http://localhost/api/commerce-control/queue/queue-001", {
      method: "PATCH", body: JSON.stringify({ productName: "충돌", expectedLastModified: "old" })
    }), { params: Promise.resolve({ queueId: "queue-001" }) });
    expect(stale.status).toBe(409);
  });

  test("creates an allowlisted command and rejects unknown natural language", async () => {
    const created = await postCommand(request("http://localhost/api/commerce-control/commands", {
      method: "POST", body: JSON.stringify({ queueId: "queue-001", command: "검토PASS", webRequestKey: "0b0681fb-0890-475c-b45f-20813673e477" })
    }));
    expect(created.status).toBe(201);
    expect((await getCommands(request("http://localhost/api/commerce-control/commands"))).status).toBe(200);
    const rejected = await postCommand(request("http://localhost/api/commerce-control/commands", {
      method: "POST", body: JSON.stringify({ queueId: "queue-001", naturalLanguage: "아무거나 알아서 해줘" })
    }));
    expect(rejected.status).toBe(400);
    const invalidKey = await postCommand(request("http://localhost/api/commerce-control/commands", {
      method: "POST", body: JSON.stringify({ queueId: "queue-001", command: "보류", webRequestKey: "not-a-uuid" })
    }));
    expect(invalidKey.status).toBe(400);
  });

  test("cancels a pending command and blocks unsafe upload settings", async () => {
    const created = await postCommand(request("http://localhost/api/commerce-control/commands", {
      method: "POST", body: JSON.stringify({ queueId: "queue-001", command: "보류", webRequestKey: "24344f76-e14c-4b1f-8f42-62f102620442" })
    }));
    const commandId = (await created.json()).command.commandId as string;
    const cancelled = await patchCommand(request(`http://localhost/api/commerce-control/commands/${commandId}`, {
      method: "PATCH", body: JSON.stringify({ action: "cancel" })
    }), { params: Promise.resolve({ commandId }) });
    expect(cancelled.status).toBe(200);

    const unsafe = await patchSettings(request("http://localhost/api/commerce-control/settings", {
      method: "PATCH", body: JSON.stringify({ expected: { "공개 자동 업로드": "FALSE" }, updates: { "공개 자동 업로드": "TRUE" } })
    }));
    expect(unsafe.status).toBe(400);
    expect(await unsafe.json()).toMatchObject({ code: "UNSAFE_SETTING_FORBIDDEN" });
  });

  test("serves logs, settings and configured booleans without credential values", async () => {
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = "sensitive-service-account@example.invalid";
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = "sensitive-private-key";
    process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "sheet-id";
    const responses = await Promise.all([
      getLogs(request("http://localhost/api/commerce-control/logs")),
      getSettings(request("http://localhost/api/commerce-control/settings")),
      getHealth(request("http://localhost/api/commerce-control/health"))
    ]);
    const serialized = JSON.stringify(await Promise.all(responses.map((response) => response.json())));
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(serialized).not.toContain("sensitive-service-account");
    expect(serialized).not.toContain("sensitive-private-key");
    delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  });
});
