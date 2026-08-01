import { NextResponse } from "next/server";
import { isCommerceControlRequestAuthorized } from "./auth";
import { SheetsControlError } from "@/lib/google-sheets/sheetSchemas";

export function unauthorized() {
  return NextResponse.json({ ok: false, code: "COMMERCE_CONTROL_UNAUTHORIZED", message: "로그인이 필요합니다." }, { status: 401 });
}

export function requireApiAuth(request: Request) {
  return isCommerceControlRequestAuthorized(request) ? null : unauthorized();
}

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
