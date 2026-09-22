import { readConfiguredSimpleProducerConfig, writeSimpleProducerConfig } from "../../src/lib/simple-producer/config";

async function main() {
  const cwd = process.cwd();
  const configured = await readConfiguredSimpleProducerConfig({ cwd });
  if (!configured.ok) throw new Error(configured.safeError);
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--show")) {
    console.log(JSON.stringify({ enabled: configured.config.enabled, dailyGenerateTarget: configured.config.dailyGenerateTarget, maxItemsPerRun: configured.config.maxItemsPerRun, generationSlots: configured.config.generationSlots, timeZone: configured.config.timeZone, evidenceRootConfigured: Boolean(configured.config.evidenceRoot) }));
    return;
  }
  const next = { ...configured.config, generationSlots: [...configured.config.generationSlots] };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!value) throw new Error("SIMPLE_PRODUCER_SETTINGS_ARGUMENT_INVALID");
    if (flag === "--enabled") next.enabled = value === "true";
    else if (flag === "--daily-target") next.dailyGenerateTarget = Number(value);
    else if (flag === "--slots") next.generationSlots = value.split(",").map((slot) => slot.trim()).filter(Boolean);
    else throw new Error("SIMPLE_PRODUCER_SETTINGS_ARGUMENT_INVALID");
  }
  await writeSimpleProducerConfig({ configPath: configured.configPath, config: next, cwd });
  console.log(JSON.stringify({ event: "simple_producer_settings_updated", enabled: next.enabled, dailyGenerateTarget: next.dailyGenerateTarget, generationSlots: next.generationSlots, timeZone: next.timeZone, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }));
}

void main().catch((error: unknown) => {
  const message = error instanceof Error && /^SIMPLE_PRODUCER_[A-Z0-9_]+$/u.test(error.message) ? error.message : "SIMPLE_PRODUCER_SETTINGS_FAILED";
  console.log(JSON.stringify({ event: "simple_producer_settings", safeError: message, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 }));
  process.exitCode = 2;
});
