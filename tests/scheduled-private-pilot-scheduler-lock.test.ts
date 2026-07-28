import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("scheduled private pilot PowerShell overlap lock", () => {
  test("only the invocation that acquired the lock may delete it", () => {
    const script = readFileSync(
      path.join(process.cwd(), "scripts", "automation", "run-scheduled-private-pilot.ps1"),
      "utf8"
    );

    expect(script).toContain("$lockAcquired = $false");
    expect(script).toContain("$lockAcquired = $true");
    expect(script).toContain('SCHEDULER_OVERLAP_LOCKED');
    expect(script).toContain("if ($lockAcquired -and [System.IO.File]::Exists($lockPath))");
    expect(script).not.toMatch(
      /finally\s*\{[\s\S]*?if\s*\(\[System\.IO\.File\]::Exists\(\$lockPath\)\)\s*\{[\s\S]*?Remove-Item/
    );
  });
});
