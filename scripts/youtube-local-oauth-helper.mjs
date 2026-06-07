#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const APPROVAL = "APPROVE_YOUTUBE_LOCAL_OAUTH_TOKEN_GENERATION";
const YOUTUBE_UPLOAD_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

const command = process.argv[2] ?? "help";
const args = parseArgs(process.argv.slice(3));

if (command === "print-auth-url") {
  printJson(buildAuthUrl());
} else if (command === "exchange-code") {
  await exchangeCode();
} else if (command === "validate-token-file") {
  validateTokenFile();
} else {
  printJson({
    ok: false,
    commands: ["print-auth-url", "exchange-code", "validate-token-file"],
    safety: "This helper never prints raw token values. Token exchange requires exact approval."
  });
}

function buildAuthUrl() {
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
  if (process.env.YOUTUBE_OAUTH_STATE?.trim()) {
    url.searchParams.set("state", process.env.YOUTUBE_OAUTH_STATE.trim());
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
  if (confirmation !== APPROVAL && confirmation !== "true") {
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

  const tokenFile = requiredEnv("YOUTUBE_TOKEN_FILE");
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

  const body = new URLSearchParams({
    code,
    client_id: requiredEnv("YOUTUBE_CLIENT_ID"),
    client_secret: requiredEnv("YOUTUBE_CLIENT_SECRET"),
    redirect_uri: requiredEnv("YOUTUBE_REDIRECT_URI"),
    grant_type: "authorization_code"
  });

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json();

  if (!response.ok) {
    printJson({
      ok: false,
      error_code: "YOUTUBE_OAUTH_TOKEN_EXCHANGE_FAILED",
      http_status: response.status,
      safe_error: typeof payload?.error === "string" ? payload.error : "token_exchange_failed",
      token_exchange_executed: true,
      token_file_written: false,
      raw_token_printed: false
    });
    process.exitCode = 1;
    return;
  }

  mkdirSync(path.dirname(path.resolve(tokenFile)), { recursive: true });
  writeFileSync(tokenFile, JSON.stringify(payload, null, 2), { encoding: "utf8", flag: "wx" });
  printJson({
    ok: true,
    action: "exchange-code",
    token_exchange_executed: true,
    token_file_written: true,
    raw_token_printed: false,
    token_metadata: tokenMetadata(payload)
  });
}

function validateTokenFile() {
  const tokenFile = requiredEnv("YOUTUBE_TOKEN_FILE");
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
    }
  }
  return parsed;
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
