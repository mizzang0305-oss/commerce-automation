/** One-shot, loopback-only Google identity verification. Never grants Studio access. */
import { createServer, type ServerResponse } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { verifiedGoogleIdentityForEmail } from "../../src/lib/commerce-studio/auth/config";

const port = 49187;
const origin = `http://127.0.0.1:${port}`;
const callbackPath = "/studio-owner-enroll-callback";
const expectedSupabaseUrl = "https://uzrancqshgtzwahdficm.supabase.co";

function fail(code: string): never { throw new Error(code); }
function reply(response: ServerResponse, status: number, message: string, location?: string) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer", ...(location ? { Location: location } : {}) });
  response.end(message);
}

async function main() {
  const email = process.env.STUDIO_OWNER_ENROLLMENT_EMAIL?.trim().toLowerCase() || "";
  const resultPath = resolve(process.env.STUDIO_OWNER_ENROLLMENT_RESULT_PATH || "");
  const publishableKey = process.env.STUDIO_ENROLL_PUBLISHABLE_KEY || "";
  const supabaseUrl = process.env.STUDIO_ENROLL_SUPABASE_URL || "";
  const relativeResult = relative(process.cwd(), resultPath);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || !isAbsolute(process.env.STUDIO_OWNER_ENROLLMENT_RESULT_PATH || "") ||
      !relativeResult || (!relativeResult.startsWith("..") && !isAbsolute(relativeResult)) ||
      supabaseUrl !== expectedSupabaseUrl || !publishableKey) fail("STUDIO_ENROLL_CONFIG_INVALID");

  const memory = new Map<string, string>();
  const client = createClient(supabaseUrl, publishableKey, { auth: {
    flowType: "pkce", persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
    storage: { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); },
      removeItem: (key) => { memory.delete(key); } }
  } });
  const { data, error } = await client.auth.signInWithOAuth({ provider: "google",
    options: { redirectTo: `${origin}${callbackPath}`, skipBrowserRedirect: true } });
  if (error || !data.url) fail("STUDIO_ENROLL_OAUTH_START_FAILED");

  let started = false;
  let callbackReceived = false;
  let finish!: (error?: Error) => void;
  const finished = new Promise<void>((resolveFinished, rejectFinished) => {
    finish = (error) => error ? rejectFinished(error) : resolveFinished();
  });
  const server = createServer((request, response) => {
    if (request.socket.remoteAddress !== "127.0.0.1" || request.headers.host !== `127.0.0.1:${port}`) {
      reply(response, 403, "Local request required."); return;
    }
    const url = new URL(request.url || "/", origin);
    if (request.method === "GET" && url.pathname === "/start" && !started) {
      started = true;
      reply(response, 302, "Continue in your browser.", data.url); return;
    }
    if (request.method !== "GET" || url.pathname !== callbackPath || !started || callbackReceived) {
      reply(response, 404, "Unavailable."); return;
    }
    callbackReceived = true;
    void (async () => {
      try {
        const code = url.searchParams.get("code");
        if (!code || url.searchParams.has("error")) fail("STUDIO_ENROLL_CALLBACK_INVALID");
        const exchanged = await client.auth.exchangeCodeForSession(code);
        if (exchanged.error) fail("STUDIO_ENROLL_CODE_EXCHANGE_FAILED");
        const verified = await client.auth.getUser();
        if (verified.error) fail("STUDIO_ENROLL_USER_VERIFICATION_FAILED");
        const identity = verifiedGoogleIdentityForEmail(verified.data.user, email);
        if (!identity) fail("STUDIO_ENROLL_IDENTITY_MISMATCH");
        await mkdir(dirname(resultPath), { recursive: true });
        await writeFile(resultPath, JSON.stringify({ provider: "google", email: identity.email,
          googleSub: identity.ownerId, verifiedAt: new Date().toISOString(), projectId: "uzrancqshgtzwahdficm" }),
        { flag: "wx", mode: 0o600 });
        reply(response, 200, "Google identity verified. You may return to Commerce Studio setup.");
        finish();
      } catch (error) {
        reply(response, 400, "Identity verification did not complete.");
        finish(error instanceof Error ? error : new Error("STUDIO_ENROLL_FAILED"));
      }
    })();
  });
  await new Promise<void>((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(port, "127.0.0.1", resolveListening);
  });
  console.log(JSON.stringify({ event: "studio_owner_enrollment", status: "awaiting_consent", startUrl: `${origin}/start`,
    callbackUrl: `${origin}${callbackPath}` }));
  const timer = setTimeout(() => finish(new Error("STUDIO_ENROLL_CONSENT_TIMEOUT")), 15 * 60 * 1000);
  try { await finished; console.log(JSON.stringify({ event: "studio_owner_enrollment", status: "verified" })); }
  finally { clearTimeout(timer); memory.clear(); await new Promise<void>((done) => server.close(() => done())); }
}

void main().catch((error: unknown) => {
  const safeError = error instanceof Error && /^STUDIO_ENROLL_[A-Z0-9_]+$/u.test(error.message) ? error.message : "STUDIO_ENROLL_FAILED";
  console.error(JSON.stringify({ event: "studio_owner_enrollment", safeError }));
  process.exitCode = 2;
});
