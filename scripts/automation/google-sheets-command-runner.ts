import { getCommerceControlRepository } from "../../src/lib/google-sheets/commerceControlRepository";
import { processOneCommand } from "../../src/lib/commerce-control/commandRunner";
import { acquireSheetsRunnerLock } from "../../src/lib/commerce-control/runnerLock";

const once = process.argv.includes("--once");
const pollSeconds = Math.min(30, Math.max(15, Number(process.env.COMMAND_RUNNER_POLL_SECONDS || 20)));
const runnerId = process.env.COMMAND_RUNNER_ID?.trim() || "";
async function main() {
  if (!runnerId) {
    process.stderr.write("COMMAND_RUNNER_ID_NOT_CONFIGURED\n");
    process.exitCode = 1;
    return;
  }
  let lock: Awaited<ReturnType<typeof acquireSheetsRunnerLock>> | undefined;
  try {
    lock = await acquireSheetsRunnerLock(process.cwd(), runnerId);
  } catch {
    process.stderr.write("SHEETS_COMMAND_RUNNER_ALREADY_RUNNING\n");
    process.exitCode = 2;
    return;
  }

  const repository = getCommerceControlRepository();
  try {
    do {
      const result = await processOneCommand({ repository, runnerId });
      process.stdout.write(`${result.processed ? "COMMAND_PROCESSED" : "NO_PENDING_COMMAND"}\n`);
      if (!once) await new Promise((resolve) => setTimeout(resolve, pollSeconds * 1000));
    } while (!once);
  } finally {
    await lock?.release();
  }
}

void main().catch(async () => {
  process.stderr.write("SHEETS_COMMAND_RUNNER_FAILED\n");
  process.exitCode = 1;
});
