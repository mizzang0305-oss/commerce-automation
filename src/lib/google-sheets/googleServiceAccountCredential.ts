import "server-only";

import { constants as fsConstants, accessSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createHash, createPrivateKey, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { SheetsControlError } from "./sheetSchemas";

const MAX_SERVICE_ACCOUNT_FILE_BYTES = 128 * 1024;

type ServiceAccountJson = {
  type?: unknown;
  client_email?: unknown;
  private_key?: unknown;
  token_uri?: unknown;
};

export type GoogleServiceAccountCredential = {
  serviceAccountEmail: string;
  privateKey: string;
  source: "key_file" | "legacy";
  keyFileOutsideRepo: boolean;
  keyFilePermissionsChecked: boolean;
  privateKeyParseReady: boolean;
};

export type GoogleCredentialResolverOptions = {
  worktreeRoot?: string;
  commonRepoRoot?: string;
  registeredWorktreeRoots?: string[];
};

function configurationError(
  code:
    | "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING"
    | "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID"
    | "GOOGLE_SERVICE_ACCOUNT_EMAIL_MISSING"
    | "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_MISSING"
    | "GOOGLE_SERVICE_ACCOUNT_CONFIGURATION_CONFLICT",
  message: string
): never {
  throw new SheetsControlError(code, message, 503);
}

function normalizedPrivateKey(value: string) {
  return value.replace(/\\n/gu, "\n").trim();
}

function secretEqual(left: string, right: string) {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

function normalizeForPathComparison(value: string) {
  const normalized = path.normalize(value).replace(/[\\/]+$/u, "");
  return process.platform === "win32" ? normalized.toLocaleLowerCase("en-US") : normalized;
}

function isWithin(candidate: string, root: string) {
  const normalizedCandidate = normalizeForPathComparison(candidate);
  const normalizedRoot = normalizeForPathComparison(root);
  return normalizedCandidate === normalizedRoot || normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`);
}

function discoverCommonRepoRoot(worktreeRoot: string) {
  const dotGitPath = path.join(/*turbopackIgnore: true*/ worktreeRoot, ".git");
  try {
    const stat = lstatSync(/*turbopackIgnore: true*/ dotGitPath);
    if (stat.isDirectory()) return realpathSync(/*turbopackIgnore: true*/ worktreeRoot);
    if (!stat.isFile()) return "";
    const marker = readFileSync(/*turbopackIgnore: true*/ dotGitPath, "utf8").trim();
    const match = /^gitdir:\s*(.+)$/iu.exec(marker);
    if (!match) return "";
    const gitDir = path.resolve(worktreeRoot, match[1]);
    const normalized = path.normalize(gitDir);
    const suffix = `${path.sep}.git${path.sep}worktrees${path.sep}`;
    const markerIndex = normalizeForPathComparison(normalized).lastIndexOf(normalizeForPathComparison(suffix));
    if (markerIndex < 0) return "";
    return normalized.slice(0, markerIndex);
  } catch {
    return "";
  }
}

function validatedTokenUri(value: string) {
  try {
    const tokenUri = new URL(value);
    const hostname = tokenUri.hostname.toLocaleLowerCase("en-US");
    const googleHost = hostname === "accounts.google.com" || hostname === "googleapis.com" || hostname.endsWith(".googleapis.com");
    return tokenUri.protocol === "https:" && tokenUri.username === "" && tokenUri.password === "" &&
      tokenUri.port === "" && tokenUri.search === "" && tokenUri.hash === "" && googleHost &&
      tokenUri.pathname.endsWith("/token");
  } catch {
    return false;
  }
}

function assertPrivateKeyParseReady(privateKey: string) {
  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file 형식이 올바르지 않습니다.");
  }
  try {
    createPrivateKey(privateKey);
  } catch {
    configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file 형식이 올바르지 않습니다.");
  }
}

function privateKeyParseReady(privateKey: string) {
  try {
    createPrivateKey(privateKey);
    return true;
  } catch {
    return false;
  }
}

function discoverRegisteredWorktreeRoots(commonRepoRoot: string) {
  if (!commonRepoRoot) return [];
  const adminRoot = path.join(/*turbopackIgnore: true*/ commonRepoRoot, ".git", "worktrees");
  try {
    return readdirSync(/*turbopackIgnore: true*/ adminRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => {
        try {
          const gitFilePath = readFileSync(
            /*turbopackIgnore: true*/ path.join(adminRoot, entry.name, "gitdir"),
            "utf8"
          ).trim();
          return gitFilePath ? [realpathSync(/*turbopackIgnore: true*/ path.dirname(gitFilePath))] : [];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function resolveForbiddenRoots(options: GoogleCredentialResolverOptions) {
  const worktreeRoot = realpathSync(/*turbopackIgnore: true*/ options.worktreeRoot ?? process.cwd());
  const configuredCommonRoot = options.commonRepoRoot
    ? realpathSync(/*turbopackIgnore: true*/ options.commonRepoRoot)
    : "";
  const discoveredCommonRoot = configuredCommonRoot || discoverCommonRepoRoot(worktreeRoot);
  const configuredWorktrees = (options.registeredWorktreeRoots ?? [])
    .map((root) => realpathSync(/*turbopackIgnore: true*/ root));
  const registeredWorktrees = configuredWorktrees.length > 0
    ? configuredWorktrees
    : discoverRegisteredWorktreeRoots(discoveredCommonRoot);
  return [worktreeRoot, discoveredCommonRoot, ...registeredWorktrees].filter(Boolean);
}

function readKeyFileCredential(keyFileValue: string, options: GoogleCredentialResolverOptions): GoogleServiceAccountCredential {
  if (!path.isAbsolute(keyFileValue)) {
    configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file 경로가 안전하지 않습니다.");
  }

  let resolvedKeyFile: string;
  let raw: string;
  try {
    const configuredPathStat = lstatSync(/*turbopackIgnore: true*/ keyFileValue);
    if (!configuredPathStat.isFile() || configuredPathStat.size <= 0 || configuredPathStat.size > MAX_SERVICE_ACCOUNT_FILE_BYTES) {
      configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file이 유효한 일반 파일이 아닙니다.");
    }
    accessSync(/*turbopackIgnore: true*/ keyFileValue, fsConstants.R_OK);
    resolvedKeyFile = realpathSync(/*turbopackIgnore: true*/ keyFileValue);
    if (resolveForbiddenRoots(options).some((root) => isWithin(resolvedKeyFile, root))) {
      configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file은 repository와 worktree 밖에 있어야 합니다.");
    }
    raw = readFileSync(/*turbopackIgnore: true*/ resolvedKeyFile, "utf8");
  } catch (error) {
    if (error instanceof SheetsControlError) throw error;
    configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING", "Service Account key file을 읽을 수 없습니다.");
  }

  let parsed: ServiceAccountJson;
  try {
    parsed = JSON.parse(raw) as ServiceAccountJson;
  } catch {
    configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file JSON이 유효하지 않습니다.");
  }

  const serviceAccountEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
  const privateKey = typeof parsed.private_key === "string" ? normalizedPrivateKey(parsed.private_key) : "";
  const tokenUri = typeof parsed.token_uri === "string" ? parsed.token_uri.trim() : "";
  if (parsed.type !== "service_account" || !serviceAccountEmail || !privateKey || !validatedTokenUri(tokenUri)) {
    configurationError("GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID", "Service Account key file 필수 필드가 유효하지 않습니다.");
  }
  assertPrivateKeyParseReady(privateKey);

  return {
    serviceAccountEmail,
    privateKey,
    source: "key_file",
    keyFileOutsideRepo: true,
    keyFilePermissionsChecked: true,
    privateKeyParseReady: true
  };
}

export function resolveGoogleServiceAccountCredential(
  env: NodeJS.ProcessEnv = process.env,
  options: GoogleCredentialResolverOptions = {}
): GoogleServiceAccountCredential {
  const keyFileValue = env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE?.trim() ?? "";
  const legacyEmail = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() ?? "";
  const legacyPrivateKey = normalizedPrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "");

  if (keyFileValue) {
    const keyFileCredential = readKeyFileCredential(keyFileValue, options);
    const emailConflicts = legacyEmail && !secretEqual(legacyEmail, keyFileCredential.serviceAccountEmail);
    const keyConflicts = legacyPrivateKey && !secretEqual(legacyPrivateKey, keyFileCredential.privateKey);
    if (emailConflicts || keyConflicts) {
      configurationError("GOOGLE_SERVICE_ACCOUNT_CONFIGURATION_CONFLICT", "Service Account 설정이 서로 일치하지 않습니다.");
    }
    return keyFileCredential;
  }

  if (!legacyEmail) {
    configurationError("GOOGLE_SERVICE_ACCOUNT_EMAIL_MISSING", "Service Account email 설정이 없습니다.");
  }
  if (!legacyPrivateKey) {
    configurationError("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_MISSING", "Service Account private key 설정이 없습니다.");
  }
  return {
    serviceAccountEmail: legacyEmail,
    privateKey: legacyPrivateKey,
    source: "legacy",
    keyFileOutsideRepo: false,
    keyFilePermissionsChecked: false,
    privateKeyParseReady: privateKeyParseReady(legacyPrivateKey)
  };
}
