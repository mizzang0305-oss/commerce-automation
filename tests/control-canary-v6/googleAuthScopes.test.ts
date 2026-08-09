import { describe, expect, test } from "vitest";
import { buildGoogleAuthScopes, DRIVE_FILE_SCOPE, SHEETS_SCOPE } from "@/lib/google-sheets/googleSheetsClient";

describe("Google auth scopes", () => {
  test.each(["", "   "])("requests Sheets-only when the Drive folder is %j", (driveVideoFolderId) => {
    expect(buildGoogleAuthScopes({ driveVideoFolderId })).toEqual([SHEETS_SCOPE]);
  });

  test("adds drive.file only when a Drive folder is explicitly configured", () => {
    expect(buildGoogleAuthScopes({ driveVideoFolderId: "approved-folder" })).toEqual([SHEETS_SCOPE, DRIVE_FILE_SCOPE]);
  });
});
