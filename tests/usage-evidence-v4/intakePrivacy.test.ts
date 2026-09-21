import { describe, expect, test } from "vitest";
import { validateOwnerSanitizedMediaManifest } from "@/lib/usage-evidence";
import { validOwnerManifest } from "./fixture";

describe("V4 owner intake privacy", () => {
  test("blocks media whose privacy is not confirmed", () => {
    const result = validateOwnerSanitizedMediaManifest({ ...validOwnerManifest(), privacyConfirmed: false });
    expect(result.valid).toBe(false);
    expect(result.blockers).toContain("OWNER_MEDIA_PRIVACY_NOT_CONFIRMED");
  });
});
