import { createHash } from "node:crypto";
import { mkdir, open, readdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type { FirstOperationManifest } from "./index";
import type { Level3Gate } from "./level3";
import { getDaily69Timing } from "./timing";
import { parseFirstOperationNamespace } from "./operationIdentity";
import { classifyTaskInvocationProvenance, TASK_PROVENANCE_EVENT_IDS, type SanitizedTaskSchedulerEvent } from "./taskProvenance";

export const FINALIZER_TASK_NAME = "Minz-Commerce-Daily69-Finalizer-NoUpload-V1";
export type FinalizerResult = {
  schemaVersion: "daily69-finalizer-result-v1";
  resultId: string;
  namespace: string;
  operationDate: string;
  expectedGitHead: string;
  actualGitHead: string;
  taskName: string;
  processId: number;
  startedAt: string;
  finishedAt: string;
  childExitCode: number;
  wrapperExitCode: number;
  outcome: "success" | "pending" | "failed";
  safeError: string;
  outputSha256: string;
  principalSidSha256: string;
  taskActionSha256: string;
  SAFE_TO_UPLOAD: false;
  PLATFORM_UPLOAD: 0;
};
export type FinalizerTaskContract = {
  schemaVersion: "daily69-finalizer-task-contract-v1";
  namespace: string;
  operationDate: string;
  expectedGitHead: string;
  taskName: string;
  principalSidSha256: string;
  taskActionSha256: string;
};
type Identity = Pick<FirstOperationManifest, "namespace" | "operationDate" | "expectedGitHead">;
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const validHash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
const taskName = (value: string) => value.replace(/^\\/u, "");
const fields = ["schemaVersion","resultId","namespace","operationDate","expectedGitHead","actualGitHead","taskName","processId","startedAt","finishedAt","childExitCode","wrapperExitCode","outcome","safeError","outputSha256","principalSidSha256","taskActionSha256","SAFE_TO_UPLOAD","PLATFORM_UPLOAD"];
const contractFields = ["schemaVersion", "namespace", "operationDate", "expectedGitHead", "taskName", "principalSidSha256", "taskActionSha256"];
function isFinalizerTaskContract(value: unknown): value is FinalizerTaskContract {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === contractFields.length && contractFields.every((key) => Object.prototype.hasOwnProperty.call(v, key))
    && v.schemaVersion === "daily69-finalizer-task-contract-v1"
    && typeof v.operationDate === "string" && parseFirstOperationNamespace(v.namespace)?.operationDate === v.operationDate
    && typeof v.expectedGitHead === "string" && /^[a-f0-9]{40}$/u.test(v.expectedGitHead)
    && typeof v.taskName === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(v.taskName)
    && validHash(v.principalSidSha256) && validHash(v.taskActionSha256);
}

export function isFinalizerResult(value: unknown): value is FinalizerResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return Object.keys(v).length === fields.length && fields.every((field) => Object.prototype.hasOwnProperty.call(v, field))
    && v.schemaVersion === "daily69-finalizer-result-v1" && typeof v.resultId === "string" && /^[a-f0-9]{32}$/u.test(v.resultId)
    && parseFirstOperationNamespace(v.namespace)?.operationDate === v.operationDate
    && typeof v.operationDate === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(v.operationDate)
    && typeof v.expectedGitHead === "string" && /^[a-f0-9]{40}$/u.test(v.expectedGitHead)
    && typeof v.actualGitHead === "string" && /^(?:[a-f0-9]{40})?$/u.test(v.actualGitHead)
    && typeof v.taskName === "string" && /^[A-Za-z0-9_-]{1,128}$/u.test(v.taskName)
    && Number.isSafeInteger(v.processId) && Number(v.processId) > 0
    && typeof v.startedAt === "string" && Number.isFinite(Date.parse(v.startedAt))
    && typeof v.finishedAt === "string" && Date.parse(v.finishedAt) >= Date.parse(v.startedAt)
    && Number.isSafeInteger(v.childExitCode) && Number.isSafeInteger(v.wrapperExitCode)
    && ["success","pending","failed"].includes(String(v.outcome))
    && typeof v.safeError === "string" && /^(?:[A-Z][A-Z0-9_:-]{0,159})?$/u.test(v.safeError)
    && validHash(v.outputSha256) && (v.principalSidSha256 === "" || validHash(v.principalSidSha256))
    && (v.taskActionSha256 === "" || validHash(v.taskActionSha256))
    && v.SAFE_TO_UPLOAD === false && v.PLATFORM_UPLOAD === 0;
}

// Pure check also supports disposable, explicitly supplied Task contracts.
// The filesystem auditor below enforces the canonical authoritative task name.
export function classifyFinalizerResultProvenance(result: FinalizerResult, contract: FinalizerTaskContract, identity: Identity, events: SanitizedTaskSchedulerEvent[]) {
  const fail = (reason: string) => ({ classification: "unknown" as const, reason, taskInstanceId: "", eventRecordIds: [] as number[] });
  if (!isFinalizerResult(result)) return fail("DAILY69_FINALIZER_RESULT_INVALID");
  if (!isFinalizerTaskContract(contract)
    || !validHash(contract.principalSidSha256) || !validHash(contract.taskActionSha256)
    || [result, contract].some((record) => record.namespace !== identity.namespace || record.operationDate !== identity.operationDate || record.expectedGitHead !== identity.expectedGitHead)
    || result.actualGitHead !== identity.expectedGitHead || result.taskName !== contract.taskName) return fail("DAILY69_FINALIZER_IDENTITY_MISMATCH");
  if (result.principalSidSha256 !== contract.principalSidSha256 || result.taskActionSha256 !== contract.taskActionSha256) return fail("DAILY69_FINALIZER_TASK_CONTRACT_MISMATCH");
  if (result.outcome !== "success" || result.childExitCode !== 0 || result.wrapperExitCode !== 0 || result.safeError !== "") return fail(result.safeError || "DAILY69_FINALIZER_FAILED");
  const started = Date.parse(result.startedAt);
  const finished = Date.parse(result.finishedAt);
  const relevant = events.filter((event) => taskName(event.taskName) === taskName(contract.taskName)
    && Date.parse(event.timeCreatedUtc) >= started - 120_000 && Date.parse(event.timeCreatedUtc) <= finished + 120_000);
  if (relevant.some((event) => event.eventId === 110)) return fail("DAILY69_FINALIZER_MANUAL_TRIGGER");
  const instances = [...new Set(relevant.filter((event) => event.eventId === 100).map((event) => event.taskInstanceId).filter(Boolean))];
  if (instances.length > 1) return fail("DAILY69_FINALIZER_TASK_INSTANCE_AMBIGUOUS");
  const matches = instances.map((instance) => {
    const chain = relevant.filter((event) => event.taskInstanceId === instance
      || (event.eventId === 129 && event.taskInstanceId === "" && event.processId === result.processId)
      || (event.eventId === 110 && event.taskInstanceId === ""));
    const provenance = classifyTaskInvocationProvenance({ taskName: contract.taskName, events: chain });
    const start = chain.find((event) => event.eventId === 100);
    const end = chain.find((event) => event.eventId === 201);
    const principalPass = [100,102].every((id) => chain.find((event) => event.eventId === id)?.principalSidSha256 === contract.principalSidSha256);
    return { instance, chain, pass: provenance.classification === "natural_scheduled"
      && [129,200,201].every((id) => chain.find((event) => event.eventId === id)?.processId === result.processId)
      && principalPass && Boolean(start && end && Date.parse(start.timeCreatedUtc) <= started && Date.parse(end.timeCreatedUtc) >= finished) };
  }).filter((candidate) => candidate.pass);
  if (matches.length !== 1) return fail("DAILY69_FINALIZER_EVENT_BINDING_FAILED");
  return { classification: "natural_scheduled" as const, reason: "", taskInstanceId: matches[0].instance,
    eventRecordIds: TASK_PROVENANCE_EVENT_IDS.map((id) => matches[0].chain.find((event) => event.eventId === id)!.eventRecordId) };
}

async function readFinalizerResults(operationRoot: string) {
  const root = join(resolve(operationRoot), "finalizer-results");
  let names: string[];
  try { names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
  return Promise.all(names.map(async (name) => {
    const raw = await readFile(join(root, name), "utf8");
    const result: unknown = JSON.parse(raw);
    if (!isFinalizerResult(result) || name !== result.resultId + ".json") throw new Error("DAILY69_FINALIZER_RESULT_INVALID");
    return { result, sha256: hash(raw) };
  }));
}

export async function finalizerExecutionTimeBounds(operationRoot: string) {
  const results = await readFinalizerResults(operationRoot);
  if (results.length !== 1) throw new Error("DAILY69_FINALIZER_RESULT_CARDINALITY_INVALID");
  return { startUtc: new Date(Date.parse(results[0].result.startedAt) - 120_000).toISOString(),
    endUtc: new Date(Date.parse(results[0].result.finishedAt) + 120_000).toISOString(), malformedReceipts: 0 };
}

export async function auditFinalizerResult(operationRoot: string, manifest: Identity, events: SanitizedTaskSchedulerEvent[] = []): Promise<Level3Gate> {
  const gate = (state: Level3Gate["state"], reason: string, actual: string): Level3Gate =>
    ({ id: "finalizer_natural_result", state, reason, actual, expected: "durable finalizer result + exact natural events/principal/action/PID/SHA", severity: "integrity" });
  const root = resolve(operationRoot);
  let results: Awaited<ReturnType<typeof readFinalizerResults>>;
  try { results = await readFinalizerResults(root); } catch { return gate("FAIL", "DAILY69_FINALIZER_RESULT_INVALID", "malformed"); }
  if (results.length === 0) return gate("UNPROVEN", "DAILY69_FINALIZER_RESULT_MISSING", "missing");
  if (results.length !== 1) return gate("FAIL", "DAILY69_FINALIZER_RESULT_CARDINALITY_INVALID", String(results.length));
  const { result, sha256 } = results[0];
  let contract: FinalizerTaskContract;
  try { contract = JSON.parse(await readFile(join(root, "task-definitions", "finalizer-task-contract.json"), "utf8")) as FinalizerTaskContract; }
  catch { return gate("UNPROVEN", "DAILY69_FINALIZER_TASK_CONTRACT_MISSING", "missing"); }
  if (!isFinalizerTaskContract(contract)) return gate("FAIL", "DAILY69_FINALIZER_TASK_CONTRACT_INVALID", "malformed");
  if (basename(root) !== manifest.namespace || contract.taskName !== FINALIZER_TASK_NAME) return gate("FAIL", "DAILY69_FINALIZER_IDENTITY_MISMATCH", "mismatch");
  const timing = getDaily69Timing(manifest.operationDate);
  if (Date.parse(result.startedAt) < timing.finalizerAt.getTime() || Date.parse(result.startedAt) >= timing.finalizerDeadline.getTime()) return gate("FAIL", "DAILY69_FINALIZER_OUTSIDE_WINDOW", "outside window");
  const observed = classifyFinalizerResultProvenance(result, contract, manifest, events);
  if (observed.classification !== "natural_scheduled") return gate("FAIL", observed.reason, result.outcome);
  const binding = { schemaVersion: "daily69-finalizer-event-binding-v1", resultId: result.resultId, resultSha256: sha256,
    namespace: manifest.namespace, operationDate: manifest.operationDate, expectedGitHead: manifest.expectedGitHead,
    taskName: result.taskName, processId: result.processId, principalSidSha256: result.principalSidSha256,
    taskActionSha256: result.taskActionSha256, ...observed, SAFE_TO_UPLOAD: false, PLATFORM_UPLOAD: 0 };
  const bindingRoot = join(root, "finalizer-results", "bindings");
  await mkdir(bindingRoot, { recursive: true });
  const path = join(bindingRoot, result.resultId + ".json");
  const expected = JSON.stringify(binding, null, 2) + "\n";
  try { const handle = await open(path, "wx"); try { await handle.writeFile(expected, "utf8"); await handle.sync(); } finally { await handle.close(); } }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (await readFile(path, "utf8") !== expected) return gate("FAIL", "DAILY69_FINALIZER_BINDING_CONFLICT", "mismatch");
  }
  return gate("PASS", "", "natural_scheduled");
}
