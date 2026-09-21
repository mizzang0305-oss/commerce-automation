import { describe, expect, test } from "vitest";
import { validateOwnerSanitizedMediaManifest } from "@/lib/usage-evidence";
import { validOwnerManifest } from "./fixture";

describe("V4 owner intake rights", () => {
  test("blocks media whose rights are not confirmed", () => {
    const result = validateOwnerSanitizedMediaManifest({ ...validOwnerManifest(), rightsConfirmed: false });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("OWNER_MEDIA_RIGHTS_NOT_CONFIRMED");
  });
});
