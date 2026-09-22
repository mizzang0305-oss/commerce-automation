import { NextResponse } from "next/server";
import {
  commerceControlAuthConfigured, consumeLoginAttempt, createCommerceControlSession, sessionCookieHeader,
  verifyCommerceControlPassword
} from "@/lib/commerce-control/auth";
import { readJsonObject } from "@/lib/commerce-control/api";

export async function POST(request: Request) {
  if (!commerceControlAuthConfigured()) {
    return NextResponse.json({ ok: false, code: "COMMERCE_CONTROL_AUTH_NOT_CONFIGURED", message: "운영자 로그인이 설정되지 않았습니다." }, { status: 503 });
  }
  const clientKey = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const limit = consumeLoginAttempt(clientKey);
  if (!limit.allowed) {
    return NextResponse.json({ ok: false, code: "LOGIN_RATE_LIMITED", message: "잠시 후 다시 시도하세요." }, {
      status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) }
    });
  }
  const body = await readJsonObject(request);
  if (!verifyCommerceControlPassword(typeof body.password === "string" ? body.password : "")) {
    return NextResponse.json({ ok: false, code: "INVALID_CREDENTIALS", message: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Set-Cookie": sessionCookieHeader(createCommerceControlSession()) } });
}
