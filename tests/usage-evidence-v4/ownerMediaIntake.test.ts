import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { validateOwnerSanitizedMediaManifest } from "@/lib/usage-evidence";
import { scanOwnerMediaInbox } from "@/lib/usage-evidence/ownerMediaIntakeV4";
import { validOwnerManifest } from "./fixture";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("V4 owner media intake", () => {
  test("blocks safely when the owner inbox is absent", async () => {
    await expect(scanOwnerMediaInbox()).resolves.toMatchObject({ inboxConfigured: false, blocker: "OWNER_MEDIA_INTAKE_ROOT_NOT_CONFIGURED", rootStored: false });
  });

  test("requires one manifest per source folder", async () => {
    const root = await mkdtemp(join(tmpdir(), "owner-media-v4-")); roots.push(root);
    await mkdir(join(root, "kitchen_organization", "source-001"), { recursive: true });
    const result = await scanOwnerMediaInbox(root);
    expect(result).toMatchObject({ sourceFolders: 1, validManifests: 0, blockedSources: 1, blocker: "OWNER_MEDIA_INTAKE_REVIEW_BLOCKED", rootStored: false });
    expect(result.records[0].blockers).toContain("OWNER_MEDIA_INTAKE_MANIFEST_REQUIRED");
  });

  test("keeps source approval separate from human derived review", async () => {
    const manifest = validOwnerManifest();
    expect(validateOwnerSanitizedMediaManifest(manifest)).toEqual({ valid: true, blockers: [], humanOwnerReviewPromoted: false });
    const root = await mkdtemp(join(tmpdir(), "owner-media-v4-")); roots.push(root);
    const folder = join(root, "kitchen_organization", "source-001");
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, "intake-manifest.json"), JSON.stringify(manifest), "utf8");
    await expect(scanOwnerMediaInbox(root)).resolves.toMatchObject({ acceptedSources: 1, humanOwnerReviewPromoted: false, blocker: null });
  });
});
