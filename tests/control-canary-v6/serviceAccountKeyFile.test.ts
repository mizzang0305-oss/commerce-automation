import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  googleSheetsConfigured,
  readGoogleSheetsConfig
} from "@/lib/google-sheets/googleSheetsClient";

const tempRoots: string[] = [];
let validPrivateKey = "";

beforeAll(() => {
  validPrivateKey = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { format: "pem", type: "pkcs8" },
    publicKeyEncoding: { format: "pem", type: "spki" }
  }).privateKey;
});

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix: string) {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeServiceAccountKey(filePath: string, overrides: Record<string, unknown> = {}) {
  writeFileSync(filePath, JSON.stringify({
    type: "service_account",
    client_email: "configured-service-account@example.invalid",
    private_key: validPrivateKey,
    token_uri: "https://oauth2.googleapis.com/token",
    ...overrides
  }), "utf8");
}

function resolverFixture() {
  const keyRoot = tempRoot("commerce-sa-key-");
  const repositoryRoot = tempRoot("commerce-sa-repo-");
  const worktreeRoot = path.join(repositoryRoot, "linked-worktree");
  mkdirSync(worktreeRoot);
  const keyFile = path.join(keyRoot, "service-account.json");
  writeServiceAccountKey(keyFile);
  return { keyFile, repositoryRoot, worktreeRoot };
}

function envFor(keyFile: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    GOOGLE_SHEETS_SPREADSHEET_ID: "configured-spreadsheet",
    GOOGLE_SERVICE_ACCOUNT_KEY_FILE: keyFile,
    ...extra
  };
}

describe("Service Account key-file resolution", () => {
  test("prefers a valid repo-external JSON key file without retaining its path", () => {
    const fixture = resolverFixture();
    const config = readGoogleSheetsConfig(envFor(fixture.keyFile), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    });

    expect(config).toMatchObject({
      credentialSource: "key_file",
      keyFileOutsideRepo: true,
      keyFilePermissionsChecked: true,
      privateKeyParseReady: true,
      driveVideoFolderId: ""
    });
    expect(config).not.toHaveProperty("keyFilePath");
    expect(googleSheetsConfigured(envFor(fixture.keyFile), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    })).toBe(true);
  });

  test("classifies an unreadable or absent configured key file without exposing its path", () => {
    const fixture = resolverFixture();
    const missing = path.join(path.dirname(fixture.keyFile), "absent.json");
    let thrown: unknown;
    try {
      readGoogleSheetsConfig(envFor(missing), {
        worktreeRoot: fixture.worktreeRoot,
        commonRepoRoot: fixture.repositoryRoot
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_MISSING" });
    expect(JSON.stringify(thrown)).not.toContain(missing);
  });

  test.each([
    [{ type: "user" }, "wrong type"],
    [{ token_uri: "http://oauth2.googleapis.com/token" }, "non-HTTPS token URI"],
    [{ token_uri: "https://evil.example/token" }, "non-Google token URI"],
    [{ private_key: "-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----" }, "unparseable private key"]
  ])("rejects an invalid key-file contract: %s", (overrides) => {
    const fixture = resolverFixture();
    writeServiceAccountKey(fixture.keyFile, overrides as Record<string, unknown>);
    expect(() => readGoogleSheetsConfig(envFor(fixture.keyFile), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    })).toThrowError(expect.objectContaining({ code: "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID" }));
    expect(googleSheetsConfigured(envFor(fixture.keyFile), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    })).toBe(false);
  });

  test("rejects malformed JSON", () => {
    const fixture = resolverFixture();
    writeFileSync(fixture.keyFile, "{not-json", "utf8");
    expect(() => readGoogleSheetsConfig(envFor(fixture.keyFile), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    })).toThrowError(expect.objectContaining({ code: "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID" }));
  });

  test("rejects a key file inside the worktree or common repository", () => {
    const fixture = resolverFixture();
    const inWorktree = path.join(fixture.worktreeRoot, "key.json");
    writeServiceAccountKey(inWorktree);
    expect(() => readGoogleSheetsConfig(envFor(inWorktree), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    })).toThrowError(expect.objectContaining({ code: "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID" }));
  });

  test("rejects a key file inside another registered worktree", () => {
    const fixture = resolverFixture();
    const siblingWorktree = tempRoot("commerce-sa-sibling-worktree-");
    const inSibling = path.join(siblingWorktree, "key.json");
    writeServiceAccountKey(inSibling);
    expect(() => readGoogleSheetsConfig(envFor(inSibling), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot,
      registeredWorktreeRoots: [siblingWorktree]
    })).toThrowError(expect.objectContaining({ code: "GOOGLE_SERVICE_ACCOUNT_KEY_FILE_INVALID" }));
  });

  test("accepts matching legacy values with key-file precedence", () => {
    const fixture = resolverFixture();
    const config = readGoogleSheetsConfig(envFor(fixture.keyFile, {
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "configured-service-account@example.invalid",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: validPrivateKey.replace(/\n/gu, "\\n")
    }), {
      worktreeRoot: fixture.worktreeRoot,
      commonRepoRoot: fixture.repositoryRoot
    });
    expect(config.credentialSource).toBe("key_file");
  });

  test("detects legacy/key-file conflicts without including raw values", () => {
    const fixture = resolverFixture();
    const conflictingEmail = "conflicting-service-account@example.invalid";
    let thrown: unknown;
    try {
      readGoogleSheetsConfig(envFor(fixture.keyFile, {
        GOOGLE_SERVICE_ACCOUNT_EMAIL: conflictingEmail,
        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: validPrivateKey
      }), {
        worktreeRoot: fixture.worktreeRoot,
        commonRepoRoot: fixture.repositoryRoot
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "GOOGLE_SERVICE_ACCOUNT_CONFIGURATION_CONFLICT" });
    const serialized = JSON.stringify(thrown);
    expect(serialized).not.toContain(conflictingEmail);
    expect(serialized).not.toContain(fixture.keyFile);
    expect(serialized).not.toContain("BEGIN PRIVATE KEY");
  });

  test("keeps the legacy pair as a backward-compatible fallback", () => {
    const config = readGoogleSheetsConfig({
      GOOGLE_SHEETS_SPREADSHEET_ID: "configured-spreadsheet",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy-service-account@example.invalid",
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "legacy-private-key"
    } as NodeJS.ProcessEnv);
    expect(config).toMatchObject({ credentialSource: "legacy", privateKeyParseReady: false });
  });

  test("requires spreadsheet ID before credential resolution", () => {
    expect(() => readGoogleSheetsConfig({} as NodeJS.ProcessEnv))
      .toThrowError(expect.objectContaining({ code: "GOOGLE_SHEETS_SPREADSHEET_ID_MISSING" }));
  });

  test("classifies missing legacy fields independently", () => {
    expect(() => readGoogleSheetsConfig({ GOOGLE_SHEETS_SPREADSHEET_ID: "configured" } as NodeJS.ProcessEnv))
      .toThrowError(expect.objectContaining({ code: "GOOGLE_SERVICE_ACCOUNT_EMAIL_MISSING" }));
    expect(() => readGoogleSheetsConfig({
      GOOGLE_SHEETS_SPREADSHEET_ID: "configured",
      GOOGLE_SERVICE_ACCOUNT_EMAIL: "legacy-service-account@example.invalid"
    } as NodeJS.ProcessEnv)).toThrowError(expect.objectContaining({ code: "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_MISSING" }));
  });
});
