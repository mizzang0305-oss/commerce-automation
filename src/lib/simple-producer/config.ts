import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { SIMPLE_PRODUCER_SCHEMA, type SimpleProducerConfig } from "@/lib/simple-producer/types";

const CONFIG_ENV = "SIMPLE_PRODUCER_CONFIG_PATH";
const MAX_SLOT_HOUR = 21;

export type SimpleProducerConfigResult =
  | { ok: true; config: SimpleProducerConfig; configPath: string }
  | { ok: false; safeError: string };

export async function readConfiguredSimpleProducerConfig(input: {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
} = {}): Promise<SimpleProducerConfigResult> {
  const cwd = resolve(input.cwd ?? process.cwd());
  const env = input.env ?? process.env;
  const configPath = env[CONFIG_ENV]?.trim() ?? "";
  if (!configPath || !isAbsolute(configPath)) return { ok: false, safeError: "SIMPLE_PRODUCER_CONFIG_PATH_NOT_ABSOLUTE" };
  const absoluteConfigPath = resolve(configPath);
  if (isPathInside(absoluteConfigPath, cwd)) return { ok: false, safeError: "SIMPLE_PRODUCER_CONFIG_PATH_INSIDE_REPOSITORY" };
  try {
    const raw = JSON.parse(await readFile(absoluteConfigPath, "utf8")) as unknown;
    return { ok: true, config: parseSimpleProducerConfig(raw, cwd), configPath: absoluteConfigPath };
  } catch (error) {
    return { ok: false, safeError: error instanceof Error && /^SIMPLE_PRODUCER_[A-Z0-9_]+$/u.test(error.message) ? error.message : "SIMPLE_PRODUCER_CONFIG_READ_FAILED" };
  }
}

export function parseSimpleProducerConfig(value: unknown, cwd = process.cwd()): SimpleProducerConfig {
  if (!isRecord(value) || value.schema !== SIMPLE_PRODUCER_SCHEMA) throw new Error("SIMPLE_PRODUCER_CONFIG_INVALID");
  if (typeof value.enabled !== "boolean") throw new Error("SIMPLE_PRODUCER_CONFIG_INVALID");
  if (!isIntegerInRange(value.dailyGenerateTarget, 1, 3)) throw new Error("SIMPLE_PRODUCER_DAILY_TARGET_INVALID");
  if (value.maxItemsPerRun !== 1) throw new Error("SIMPLE_PRODUCER_MAX_ITEMS_PER_RUN_INVALID");
  if (value.timeZone !== "Asia/Seoul") throw new Error("SIMPLE_PRODUCER_TIMEZONE_INVALID");
  if (!Array.isArray(value.generationSlots) || value.generationSlots.length < value.dailyGenerateTarget || value.generationSlots.length > 3) throw new Error("SIMPLE_PRODUCER_SLOTS_INVALID");
  const generationSlots = value.generationSlots.map((entry) => String(entry));
  if (new Set(generationSlots).size !== generationSlots.length || !generationSlots.every(isValidSlot) || !isAscending(generationSlots)) throw new Error("SIMPLE_PRODUCER_SLOTS_INVALID");
  if (typeof value.evidenceRoot !== "string" || !isAbsolute(value.evidenceRoot)) throw new Error("SIMPLE_PRODUCER_EVIDENCE_ROOT_INVALID");
  const evidenceRoot = resolve(value.evidenceRoot);
  if (isPathInside(evidenceRoot, resolve(cwd))) throw new Error("SIMPLE_PRODUCER_EVIDENCE_ROOT_INSIDE_REPOSITORY");
  return {
    schema: SIMPLE_PRODUCER_SCHEMA,
    enabled: value.enabled,
    dailyGenerateTarget: value.dailyGenerateTarget,
    maxItemsPerRun: 1,
    generationSlots,
    timeZone: "Asia/Seoul",
    evidenceRoot
  };
}

export async function writeSimpleProducerConfig(input: {
  configPath: string;
  config: SimpleProducerConfig;
  cwd?: string;
}): Promise<void> {
  const configPath = resolve(input.configPath);
  if (!isAbsolute(input.configPath)) throw new Error("SIMPLE_PRODUCER_CONFIG_PATH_NOT_ABSOLUTE");
  if (isPathInside(configPath, resolve(input.cwd ?? process.cwd()))) throw new Error("SIMPLE_PRODUCER_CONFIG_PATH_INSIDE_REPOSITORY");
  const config = parseSimpleProducerConfig(input.config, input.cwd);
  await mkdir(dirname(configPath), { recursive: true });
  const temporaryPath = `${configPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await rename(temporaryPath, configPath);
  } finally {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}

export function isPathInside(candidate: string, parent: string) {
  const pathRelative = relative(parent, candidate);
  return pathRelative === "" || (!pathRelative.startsWith("..") && !isAbsolute(pathRelative));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

function isValidSlot(value: string) {
  const match = /^(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d)$/u.exec(value);
  return Boolean(match && Number(match.groups?.hour ?? 24) <= MAX_SLOT_HOUR);
}

function isAscending(slots: string[]) {
  return slots.every((slot, index) => index === 0 || slots[index - 1].localeCompare(slot) < 0);
}
