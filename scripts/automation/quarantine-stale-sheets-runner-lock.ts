import path from "node:path";
import { quarantineVerifiedDeadSheetsRunnerLock } from "../../src/lib/commerce-control/runnerLock";

function required(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error("SHEETS_COMMAND_RUNNER_MAINTENANCE_ARGUMENT_MISSING");
  return value;
}

void (async () => {
  const repoRoot = path.resolve(required("--repo-root"));
  const expectedPid = Number(required("--expected-pid"));
  const expectedSha256 = required("--expected-sha256").toLowerCase();
  const result = await quarantineVerifiedDeadSheetsRunnerLock(repoRoot, { expectedPid, expectedSha256 });
  process.stdout.write(`${JSON.stringify({ event: "sheets_runner_stale_lock_quarantined", ...result })}\n`);
})().catch((error: unknown) => {
  const safeError = error instanceof Error && /^[A-Z0-9_:-]+$/u.test(error.message)
    ? error.message
    : "SHEETS_COMMAND_RUNNER_MAINTENANCE_FAILED";
  process.stderr.write(`${safeError}\n`);
  process.exitCode = 1;
});
