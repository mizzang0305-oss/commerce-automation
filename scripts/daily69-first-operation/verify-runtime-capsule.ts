import { verifyFirstOperationTaskCapsule } from "../../src/lib/daily69-first-operation/runtimeCapsule";

void (async () => {
  await verifyFirstOperationTaskCapsule({
    operationRoot: requiredArg("--operation-root"), namespace: requiredArg("--namespace"),
    capsulePath: requiredArg("--capsule-path"), manifestSha256: requiredArg("--manifest-sha256"),
    bundleDigest: requiredArg("--bundle-digest"), binarySha256: requiredArg("--binary-sha256"),
  });
  process.stdout.write(`${JSON.stringify({ event: "daily69_runtime_capsule_verified", verified: true })}\n`);
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  const safeError = /^CODEX_[A-Z0-9_]+$/u.test(message) ? message : "CODEX_CAPSULE_TASK_VERIFICATION_FAILED";
  process.stderr.write(`${JSON.stringify({ event: "daily69_runtime_capsule_failed", safeError, verified: false })}\n`);
  process.exitCode = 3;
});

function requiredArg(name: string) {
  const index = process.argv.indexOf(name), value = index < 0 ? "" : process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error("CODEX_CAPSULE_TASK_ARGUMENT_REQUIRED");
  return value;
}
