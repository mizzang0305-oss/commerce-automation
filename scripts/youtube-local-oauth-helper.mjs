#!/usr/bin/env node

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const APPROVAL = "APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION";
const REAUTH_APPROVAL = "APPROVE_FIX_YOUTUBE_LOOPBACK_CALLBACK_REAUTH_NO_UPLOAD";
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

const command = process.argv[2] ?? "help";
const args = parseArgs(process.argv.slice(3));

if (command === "print-auth-url") {
  printJson(buildAuthUrl());
} else if (command === "exchange-code") {
  await exchangeCode();
} else if (command === "reauth-local") {
  await reauthLocal();
} else if (command === "validate-token-file") {
  validateTokenFile();
} else {
  printJson({
    ok: false,
    commands: ["print-auth-url", "exchange-code", "reauth-local", "validate-token-file"],
    safety: "This helper never prints raw token values. Token exchange requires exact approval."
  });
}

function buildAuthUrl(options = {}) {
  const clientId = requiredEnv("YOUTUBE_CLIENT_ID");
  const redirectUri = requiredEnv("YOUTUBE_REDIRECT_URI");
  const scope = process.env.YOUTUBE_UPLOAD_SCOPE?.trim() || YOUTUBE_UPLOAD_SCOPE;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  const state = options.state ?? process.env.YOUTUBE_OAUTH_STATE?.trim();
  if (state) {
    url.searchParams.set("state", state);
  }
  return {
    ok: true,
    action: "print-auth-url",
    authorization_url: url.toString(),
    external_api_called: false,
    token_exchange_executed: false,
    raw_token_printed: false
  };
}

async function exchangeCode() {
  const confirmation = args.confirm ?? process.env.APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION;
  if (confirmation !== APPROVAL) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_LOCAL_OAUTH_APPROVAL_REQUIRED",
      required_confirmation: APPROVAL,
      token_exchange_executed: false,
      token_file_written: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const tokenFile = requiredTokenFileEnv();
  const pathValidation = validateTokenPath(tokenFile);
  if (!pathValidation.safe) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_TOKEN_FILE_PATH_BLOCKED",
      safe_error: pathValidation.safe_summary,
      token_exchange_executed: false,
      token_file_written: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const code = args.code ?? process.env.YOUTUBE_AUTH_CODE;
  if (!code?.trim()) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_AUTH_CODE_MISSING",
      token_exchange_executed: false,
      token_file_written: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const exchange = await exchangeAuthorizationCode(code, requiredEnv("YOUTUBE_REDIRECT_URI"));
  if (!exchange.ok) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_OAUTH_TOKEN_EXCHANGE_FAILED",
      http_status: exchange.http_status,
      safe_error: exchange.error_code,
      token_exchange_executed: true,
      token_file_written: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(path.resolve(tokenFile)), { recursive: true });
  writeFileSync(tokenFile, JSON.stringify(exchange.payload, null, 2), { encoding: "utf8", flag: "wx" });
  printJson({
    ok: true,
    action: "exchange-code",
    token_exchange_executed: true,
    token_file_written: true,
    raw_token_printed: false,
    token_metadata: tokenMetadata(exchange.payload)
  });
}

async function reauthLocal() {
  const confirmation = args.confirm ?? process.env.APPROVE_FIX_YOUTUBE_LOOPBACK_CALLBACK_REAUTH_NO_UPLOAD;
  if (confirmation !== REAUTH_APPROVAL) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_LOOPBACK_REAUTH_APPROVAL_REQUIRED",
      required_confirmation: REAUTH_APPROVAL,
      listener_started: false,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const tokenFile = requiredTokenFileEnv();
  const pathValidation = validateTokenPath(tokenFile);
  if (!pathValidation.safe) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_TOKEN_FILE_PATH_BLOCKED",
      safe_error: pathValidation.safe_summary,
      listener_started: false,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const redirectUri = requiredEnv("YOUTUBE_REDIRECT_URI");
  const callback = validateLoopbackRedirectUri(redirectUri);
  if (!callback.safe) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_REDIRECT_URI_MISMATCH",
      configured_redirect_uri_present: Boolean(redirectUri),
      callback_host: callback.callback_host,
      callback_port: callback.callback_port,
      callback_path: callback.callback_path,
      redirect_uri_mismatch: true,
      listener_started: false,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const state = process.env.YOUTUBE_OAUTH_STATE?.trim() || randomUUID();
  const timeoutMs = normalizeTimeoutMs(args.timeoutMs);
  const callbackResult = startCallbackListener({ callback, redirectUri, state });
  const listener = await callbackResult.listenerReady;
  if (!listener.ok) {
    printJson({
      ok: false,
      action: "reauth-local",
      error_code: listener.error_code,
      listener_started: false,
      callback_host: callback.callback_host,
      callback_port: callback.callback_port,
      callback_path: callback.callback_path,
      redirect_uri_matches_listener: true,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const authUrl = buildAuthUrl({ state }).authorization_url;
  const browserOpened = args.noOpen ? false : await openBrowser(authUrl);
  if (!browserOpened && !args.noOpen) {
    await closeServer(listener.server);
    printJson({
      ok: false,
      action: "reauth-local",
      error_code: "YOUTUBE_BROWSER_OPEN_FAILED",
      listener_started: true,
      callback_host: callback.callback_host,
      callback_port: callback.callback_port,
      callback_path: callback.callback_path,
      redirect_uri_matches_listener: true,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const result = await Promise.race([
    callbackResult.callbackReceived,
    wait(timeoutMs).then(() => ({ ok: false, error_code: "WAITING_FOR_BROWSER_CONSENT" }))
  ]);
  await closeServer(listener.server);

  if (!result.ok) {
    printJson({
      ok: false,
      action: "reauth-local",
      error_code: result.error_code,
      listener_started: true,
      callback_host: callback.callback_host,
      callback_port: callback.callback_port,
      callback_path: callback.callback_path,
      redirect_uri_matches_listener: true,
      browser_action_required: true,
      user_completed_browser_consent: false,
      callback_received: result.error_code !== "WAITING_FOR_BROWSER_CONSENT",
      callback_state_valid: false,
      token_exchange_executed: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const exchange = await exchangeAuthorizationCode(result.code, redirectUri);
  if (!exchange.ok) {
    printJson({
      ok: false,
      action: "reauth-local",
      error_code: "YOUTUBE_OAUTH_TOKEN_EXCHANGE_FAILED",
      safe_error: exchange.error_code,
      http_status: exchange.http_status,
      listener_started: true,
      callback_host: callback.callback_host,
      callback_port: callback.callback_port,
      callback_path: callback.callback_path,
      redirect_uri_matches_listener: true,
      browser_action_required: true,
      user_completed_browser_consent: true,
      callback_received: true,
      callback_state_valid: true,
      token_exchange_executed: true,
      token_exchange_success: false,
      token_file_written: false,
      raw_url_printed: false,
      auth_code_printed: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const oldTokenBackedUp = backupExistingTokenFile(tokenFile);
  mkdirSync(path.dirname(path.resolve(tokenFile)), { recursive: true });
  writeFileSync(tokenFile, JSON.stringify(exchange.payload, null, 2), { encoding: "utf8" });
  const refresh = await testRefreshedToken(exchange.payload);
  if (refresh.ok && refresh.tokenJson) {
    writeFileSync(tokenFile, JSON.stringify(refresh.tokenJson, null, 2), { encoding: "utf8" });
  }

  const finalToken = refresh.tokenJson ?? exchange.payload;
  printJson({
    ok: refresh.ok,
    action: "reauth-local",
    listener_started: true,
    callback_host: callback.callback_host,
    callback_port: callback.callback_port,
    callback_path: callback.callback_path,
    redirect_uri_matches_listener: true,
    browser_action_required: true,
    user_completed_browser_consent: true,
    callback_received: true,
    callback_state_valid: true,
    token_exchange_executed: true,
    token_exchange_success: true,
    old_token_backed_up_or_quarantined: oldTokenBackedUp,
    token_file_written: true,
    refresh_test_success: refresh.ok,
    refresh_error_code: refresh.error_code,
    raw_url_printed: false,
    auth_code_printed: false,
    raw_token_printed: false,
    token_metadata: tokenMetadata(finalToken)
  });
  if (!refresh.ok) {
    process.exitCode = 1;
  }
}

function validateTokenFile() {
  const tokenFile = requiredTokenFileEnv();
  const pathValidation = validateTokenPath(tokenFile);
  if (!pathValidation.safe) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_TOKEN_FILE_PATH_BLOCKED",
      safe_error: pathValidation.safe_summary,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  if (!existsSync(tokenFile)) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_TOKEN_FILE_MISSING",
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  const payload = JSON.parse(readFileSync(tokenFile, "utf8"));
  printJson({
    ok: true,
    action: "validate-token-file",
    raw_token_printed: false,
    token_metadata: tokenMetadata(payload)
  });
}

function startCallbackListener({ callback, redirectUri, state }) {
  let settled = false;
  let resolveReady;
  let resolveCallback;
  const listenerReady = new Promise((resolve) => {
    resolveReady = resolve;
  });
  const callbackReceived = new Promise((resolve) => {
    resolveCallback = resolve;
  });
  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url ?? "/", redirectUri);
    if (requestUrl.pathname !== callback.callback_path) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("OAuth callback path not found.");
      return;
    }
    if (settled) {
      response.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("OAuth callback was already received.");
      return;
    }
    settled = true;
    const receivedState = requestUrl.searchParams.get("state") ?? "";
    const code = requestUrl.searchParams.get("code") ?? "";
    const oauthError = requestUrl.searchParams.get("error") ?? "";
    if (oauthError) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("OAuth consent was not completed. Return to the terminal.");
      resolveCallback({ ok: false, error_code: normalizeOAuthError(oauthError) });
      return;
    }
    if (receivedState !== state) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("OAuth state mismatch. Return to the terminal.");
      resolveCallback({ ok: false, error_code: "YOUTUBE_OAUTH_STATE_MISMATCH" });
      return;
    }
    if (!code.trim()) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("OAuth code was missing. Return to the terminal.");
      resolveCallback({ ok: false, error_code: "YOUTUBE_AUTH_CODE_MISSING" });
      return;
    }
    response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("YouTube OAuth consent received. You can return to the terminal.");
    resolveCallback({ ok: true, code });
  });
  server.once("error", (error) => {
    resolveReady({
      ok: false,
      error_code: error.code === "EADDRINUSE" ? "YOUTUBE_CALLBACK_PORT_IN_USE" : "YOUTUBE_CALLBACK_LISTENER_FAILED",
      server
    });
  });
  server.listen(callback.callback_port, callback.listen_host, () => {
    resolveReady({ ok: true, server });
  });
  return { listenerReady, callbackReceived };
}

async function exchangeAuthorizationCode(code, redirectUri) {
  const body = new URLSearchParams({
    code,
    client_id: requiredEnv("YOUTUBE_CLIENT_ID"),
    client_secret: requiredEnv("YOUTUBE_CLIENT_SECRET"),
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  });
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await safeJson(response);
  if (!response.ok) {
    return {
      ok: false,
      http_status: response.status,
      error_code: typeof payload?.error === "string" ? payload.error : "token_exchange_failed"
    };
  }
  return { ok: true, payload };
}

async function testRefreshedToken(tokenJson) {
  const refreshToken = typeof tokenJson.refresh_token === "string" ? tokenJson.refresh_token.trim() : "";
  if (!refreshToken) {
    return {
      ok: false,
      error_code: "missing_refresh_token",
      tokenJson
    };
  }
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("YOUTUBE_CLIENT_ID"),
      client_secret: requiredEnv("YOUTUBE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });
  const payload = await safeJson(response);
  if (!response.ok || typeof payload.access_token !== "string" || !payload.access_token.trim()) {
    return {
      ok: false,
      error_code: typeof payload?.error === "string" ? payload.error : "token_refresh_failed",
      tokenJson
    };
  }
  return {
    ok: true,
    error_code: null,
    tokenJson: {
      ...tokenJson,
      ...pickRefreshFields(payload),
      refresh_token: refreshToken
    }
  };
}

function tokenMetadata(payload) {
  const scopes = new Set();
  for (const value of [payload.scope, payload.scopes, payload.granted_scopes]) {
    if (typeof value === "string") {
      value.split(/\s+/).filter(Boolean).forEach((scope) => scopes.add(scope));
    }
    if (Array.isArray(value)) {
      value.filter((scope) => typeof scope === "string").forEach((scope) => scopes.add(scope));
    }
  }
  return {
    access_token_present: typeof payload.access_token === "string",
    refresh_token_present: typeof payload.refresh_token === "string",
    scopes_ready: scopes.has(YOUTUBE_UPLOAD_SCOPE),
    raw_token_returned: false
  };
}

function validateTokenPath(tokenFile) {
  const resolvedPath = path.resolve(tokenFile);
  const resolvedRoot = path.resolve(process.cwd());
  const relative = path.relative(resolvedRoot, resolvedPath);
  const insideRepo = relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  if (insideRepo) {
    return {
      safe: false,
      safe_summary: "Token file path is inside the repository and is blocked."
    };
  }
  return {
    safe: true,
    safe_summary: "Token file path is outside the repository."
  };
}

function validateLoopbackRedirectUri(redirectUri) {
  try {
    const url = new URL(redirectUri);
    const host = url.hostname === "[::1]" ? "::1" : url.hostname;
    const isLoopback = ["127.0.0.1", "localhost", "::1"].includes(host);
    const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
    const callbackPath = url.pathname || "/";
    const safe = isLoopback && Number.isInteger(port) && port > 0 && callbackPath !== "/";
    return {
      safe,
      callback_host: host,
      listen_host: host,
      callback_port: port,
      callback_path: callbackPath
    };
  } catch {
    return {
      safe: false,
      callback_host: null,
      callback_port: null,
      callback_path: null
    };
  }
}

function backupExistingTokenFile(tokenFile) {
  if (!existsSync(tokenFile)) {
    return false;
  }
  try {
    copyFileSync(tokenFile, `${tokenFile}.bak-${Date.now()}`);
    return true;
  } catch {
    return false;
  }
}

async function openBrowser(url) {
  const opener = process.platform === "win32"
    ? { command: "rundll32.exe", args: ["url.dll,FileProtocolHandler", url] }
    : process.platform === "darwin"
      ? { command: "open", args: [url] }
      : { command: "xdg-open", args: [url] };
  return new Promise((resolve) => {
    execFile(opener.command, opener.args, { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

function normalizeTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CALLBACK_TIMEOUT_MS;
  }
  return Math.min(Math.max(parsed, 5_000), 10 * 60 * 1000);
}

function normalizeOAuthError(value) {
  if (value === "access_denied") {
    return "YOUTUBE_OAUTH_ACCESS_DENIED";
  }
  return "YOUTUBE_OAUTH_CALLBACK_ERROR";
}

function pickRefreshFields(payload) {
  const next = {};
  for (const key of ["access_token", "scope", "scopes", "granted_scopes", "expiry_date", "expires_at", "token_type"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      next[key] = value.trim();
    } else if (Array.isArray(value)) {
      next[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      next[key] = value;
    }
  }
  if (typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)) {
    next.expiry_date = Date.now() + payload.expires_in * 1000;
  }
  return next;
}

async function safeJson(response) {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json : {};
  } catch {
    return {};
  }
}

function wait(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_LOCAL_OAUTH_ENV_MISSING",
      missing_env: name,
      raw_token_printed: false
    });
    process.exit(1);
  }
  return value;
}

function requiredTokenFileEnv() {
  const value = process.env.YOUTUBE_LOCAL_TOKEN_FILE_PATH?.trim() || process.env.YOUTUBE_TOKEN_FILE?.trim();
  if (!value) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_LOCAL_OAUTH_ENV_MISSING",
      missing_env: "YOUTUBE_LOCAL_TOKEN_FILE_PATH_OR_YOUTUBE_TOKEN_FILE",
      raw_token_printed: false
    });
    process.exit(1);
  }
  return value;
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--confirm") {
      parsed.confirm = argv[index + 1];
      index += 1;
    } else if (arg === "--code") {
      parsed.code = argv[index + 1];
      index += 1;
    } else if (arg === "--timeout-ms") {
      parsed.timeoutMs = argv[index + 1];
      index += 1;
    } else if (arg === "--no-open") {
      parsed.noOpen = true;
    }
  }
  return parsed;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
