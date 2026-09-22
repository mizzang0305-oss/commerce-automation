import "server-only";

import { createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const COMMERCE_CONTROL_COOKIE = "commerce_control_session";
const SESSION_SECONDS = 8 * 60 * 60;

type SessionPayload = { exp: number; nonce: string; role: "owner" };

function config(env: NodeJS.ProcessEnv = process.env) {
  const password = env.COMMERCE_CONTROL_PASSWORD?.trim() ?? "";
  const secret = env.COMMERCE_CONTROL_SESSION_SECRET?.trim() ?? "";
  return { password, secret, configured: password.length >= 10 && secret.length >= 32 };
}

export function commerceControlAuthConfigured(env: NodeJS.ProcessEnv = process.env) {
  return config(env).configured;
}

function digest(value: string) {
  return createHash("sha256").update(value).digest();
}

export function verifyCommerceControlPassword(value: string, env: NodeJS.ProcessEnv = process.env) {
  const current = config(env);
  if (!current.configured) return false;
  return timingSafeEqual(digest(value), digest(current.password));
}

export function createCommerceControlSession(now = Date.now(), env: NodeJS.ProcessEnv = process.env) {
  const current = config(env);
  if (!current.configured) throw new Error("COMMERCE_CONTROL_AUTH_NOT_CONFIGURED");
  const payload: SessionPayload = { exp: Math.floor(now / 1000) + SESSION_SECONDS, nonce: randomBytes(12).toString("hex"), role: "owner" };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", current.secret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyCommerceControlSession(token: string | undefined, now = Date.now(), env: NodeJS.ProcessEnv = process.env) {
  const current = config(env);
  if (!token || !current.configured) return false;
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return false;
  const expected = createHmac("sha256", current.secret).update(encoded).digest("base64url");
  if (!timingSafeEqual(digest(signature), digest(expected))) return false;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SessionPayload;
    return payload.role === "owner" && Number.isInteger(payload.exp) && payload.exp > Math.floor(now / 1000);
  } catch {
    return false;
  }
}

function requestCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

export function isCommerceControlRequestAuthorized(request: Request) {
  return verifyCommerceControlSession(requestCookie(request, COMMERCE_CONTROL_COOKIE));
}

export async function requireCommerceControlPageAuth() {
  const store = await cookies();
  if (!verifyCommerceControlSession(store.get(COMMERCE_CONTROL_COOKIE)?.value)) redirect("/commerce-control/login");
}

export function sessionCookieHeader(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COMMERCE_CONTROL_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function expiredSessionCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COMMERCE_CONTROL_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

type Attempt = { count: number; resetAt: number };
const attempts = new Map<string, Attempt>();

export function consumeLoginAttempt(key: string, now = Date.now()) {
  const normalized = createHash("sha256").update(key || "unknown").digest("hex").slice(0, 16);
  const current = attempts.get(normalized);
  if (!current || current.resetAt <= now) {
    attempts.set(normalized, { count: 1, resetAt: now + 10 * 60_000 });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count > 5) return { allowed: false, retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000) };
  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetLoginAttemptsForTests() {
  attempts.clear();
}
