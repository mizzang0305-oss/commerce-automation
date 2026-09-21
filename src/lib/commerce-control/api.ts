import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { isCommerceControlRequestAuthorized } from "./auth";
import { SheetsControlError } from "@/lib/google-sheets/sheetSchemas";

export function unauthorized() {
  return NextResponse.json({ ok: false, code: "COMMERCE_CONTROL_UNAUTHORIZED", message: "로그인이 필요합니다." }, { status: 401 });
}

export function requireApiAuth(request: Request) {
  return isCommerceControlRequestAuthorized(request) ? null : unauthorized();
}

const mutationAttempts = new Map<string, { count: number; resetAt: number }>();

export function requireMutationApi(request: Request) {
  const denied = requireApiAuth(request); if (denied) return denied;
  const unsafe = requireSameOriginJson(request); if (unsafe) return unsafe;
  const client = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local-owner";
  const now = Date.now(); const current = mutationAttempts.get(client);
  const next = !current || current.resetAt <= now ? { count: 1, resetAt: now + 60_000 } : { ...current, count: current.count + 1 };
  mutationAttempts.set(client, next);
  if (next.count > 60) return NextResponse.json({ ok: false, code: "MUTATION_RATE_LIMITED", message: "요청이 너무 많습니다." }, { status: 429 });
  return null;
}

export function requireSameOriginJson(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) return NextResponse.json({ ok: false, code: "CONTENT_TYPE_REQUIRED", message: "application/json 요청만 허용됩니다." }, { status: 415 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ ok: false, code: "ORIGIN_BINDING_FAILED", message: "동일 출처 요청만 허용됩니다." }, { status: 403 });
  const requestId = request.headers.get("x-request-id")?.trim() || randomUUID();
  if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(requestId)) return NextResponse.json({ ok: false, code: "REQUEST_ID_INVALID", message: "요청 ID가 올바르지 않습니다." }, { status: 400 });
  return null;
}

export function resetMutationRateLimitsForTests() { mutationAttempts.clear(); }

export function safeApiError(error: unknown) {
  if (error instanceof SheetsControlError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: error.status });
  }
  return NextResponse.json({ ok: false, code: "COMMERCE_CONTROL_FAILED", message: "요청을 처리하지 못했습니다." }, { status: 500 });
}

export async function readJsonObject(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
