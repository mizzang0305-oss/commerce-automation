import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { validateOwnerSanitizedMediaManifest } from "./categoryDiverseV4";

export async function scanOwnerMediaInbox(root?: string) {
  if (!root?.trim()) return emptyOwnerInbox("OWNER_MEDIA_INTAKE_ROOT_NOT_CONFIGURED");
  try {
    if (!(await stat(root)).isDirectory()) return emptyOwnerInbox("OWNER_MEDIA_INBOX_NOT_FOUND");
  } catch {
    return emptyOwnerInbox("OWNER_MEDIA_INBOX_NOT_FOUND");
  }
  const records: Array<{ useCase: string; sourceFolder: string; manifestPresent: boolean; valid: boolean; blockers: string[] }> = [];
  for (const useCaseEntry of await readdir(root, { withFileTypes: true })) {
    if (!useCaseEntry.isDirectory()) continue;
    const useCaseRoot = join(root, useCaseEntry.name);
    for (const sourceEntry of await readdir(useCaseRoot, { withFileTypes: true })) {
      if (!sourceEntry.isDirectory()) continue;
      const manifestPath = join(useCaseRoot, sourceEntry.name, "intake-manifest.json");
      try {
        const validation = validateOwnerSanitizedMediaManifest(JSON.parse(await readFile(manifestPath, "utf8")));
        records.push({ useCase: useCaseEntry.name, sourceFolder: sourceEntry.name, manifestPresent: true, valid: validation.valid, blockers: validation.blockers });
      } catch {
        records.push({ useCase: useCaseEntry.name, sourceFolder: sourceEntry.name, manifestPresent: false, valid: false, blockers: ["OWNER_MEDIA_INTAKE_MANIFEST_REQUIRED"] });
      }
    }
  }
  return {
    schemaVersion: "owner-sanitized-media-inbox-scan-v1",
    inboxConfigured: true,
    rootStored: false,
    sourceFolders: records.length,
    validManifests: records.filter((record) => record.valid).length,
    rightsConfirmed: records.filter((record) => record.valid).length,
    privacyConfirmed: records.filter((record) => record.valid).length,
    acceptedSources: records.filter((record) => record.valid).length,
    blockedSources: records.filter((record) => !record.valid).length,
    humanOwnerReviewPromoted: false,
    blocker: records.length === 0 ? "OWNER_MEDIA_INBOX_EMPTY" : records.some((record) => !record.valid) ? "OWNER_MEDIA_INTAKE_REVIEW_BLOCKED" : null,
    records
  };
}

function emptyOwnerInbox(blocker: string) {
  return {
    schemaVersion: "owner-sanitized-media-inbox-scan-v1",
    inboxConfigured: false,
    rootStored: false,
    sourceFolders: 0,
    validManifests: 0,
    rightsConfirmed: 0,
    privacyConfirmed: 0,
    acceptedSources: 0,
    blockedSources: 0,
    humanOwnerReviewPromoted: false,
    blocker,
    records: [] as Array<{ useCase: string; sourceFolder: string; manifestPresent: boolean; valid: boolean; blockers: string[] }>
  };
}
