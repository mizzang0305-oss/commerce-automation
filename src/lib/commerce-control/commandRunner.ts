import { safeJson, SheetsControlError, toKstTimestamp, type QueuePatch, type SheetCommand } from "@/lib/google-sheets/sheetSchemas";
import type { CommerceControlRepository } from "@/lib/google-sheets/commerceControlRepository";

export type AutomationExecutionResult = {
  status: "완료" | "실패" | "사람확인필요";
  safeMessage: string;
  queuePatch?: Record<string, string | number | null>;
  externalCall: boolean;
};

export interface AllowlistedAutomationExecutor {
  execute(command: SheetCommand): Promise<AutomationExecutionResult>;
}

export class DisabledAutomationExecutor implements AllowlistedAutomationExecutor {
  async execute(): Promise<AutomationExecutionResult> {
    return {
      status: "사람확인필요",
      safeMessage: "LOCAL_AUTOMATION_EXECUTION_NOT_APPROVED",
      externalCall: false
    };
  }
}

function parseRequestObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const QUEUE_PATCH_FIELDS = ["productName", "category", "price", "affiliateUrl", "errorMemo", "progressStatus", "humanReview", "videoUrl", "voiceStatus", "asrScore", "usageSceneConfirmed", "qualityDecision", "uploadStatus", "youtubeUrl"] as const;

function allowedQueuePatch(value: Record<string, unknown>) {
  const patch: QueuePatch = {};
  for (const key of QUEUE_PATCH_FIELDS) {
    if (typeof value[key] === "string" || typeof value[key] === "number" || value[key] === null) {
      patch[key] = value[key] as never;
    }
  }
  return patch;
}

function safeFailureCode(error: unknown) {
  if (error instanceof SheetsControlError) return error.code;
  const message = error instanceof Error ? error.message : "";
  return /^[A-Z0-9_:-]{3,96}$/.test(message) ? message : "COMMAND_EXECUTION_FAILED";
}

export async function processOneCommand(input: {
  repository: CommerceControlRepository;
  runnerId: string;
  executor?: AllowlistedAutomationExecutor;
}) {
  const namespace = await input.repository.activeNamespace();
  const command = await input.repository.commands.claimOldest(input.runnerId, namespace);
  if (!command) return { processed: false as const };
  if (!command.namespace || command.namespace !== namespace) throw new Error("COMMAND_NAMESPACE_MISMATCH");
  const startedAt = toKstTimestamp();
  const queueBefore = command.queueId ? await input.repository.queue.find(command.queueId, namespace) : null;
  let result: AutomationExecutionResult;

  try {
    if (["보류", "제외", "검토PASS", "검토FAIL", "수동업로드완료"].includes(command.command)) {
      if (!queueBefore) throw new Error("QUEUE_NOT_FOUND");
      const patch: Record<string, string> = {};
      if (command.command === "보류") patch.progressStatus = "보류";
      if (command.command === "제외") patch.progressStatus = "제외";
      if (command.command === "검토PASS") patch.humanReview = "PASS";
      if (command.command === "검토FAIL") { patch.humanReview = "FAIL"; patch.progressStatus = "수정필요"; }
      if (command.command === "수동업로드완료") {
        const request = parseRequestObject(command.requestValue);
        if (typeof request.youtubeUrl !== "string" || !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(request.youtubeUrl)) {
          throw new Error("YOUTUBE_URL_REQUIRED");
        }
        patch.youtubeUrl = request.youtubeUrl;
        patch.uploadStatus = "완료";
      }
      await input.repository.queue.update(command.queueId, patch, queueBefore.lastModified, namespace);
      result = { status: "완료", safeMessage: `${command.command}_APPLIED`, externalCall: false };
    } else if (command.command === "메타데이터수정") {
      if (!queueBefore) throw new Error("QUEUE_NOT_FOUND");
      const patch = allowedQueuePatch(parseRequestObject(command.requestValue));
      if (Object.keys(patch).length > 0) {
        await input.repository.queue.update(command.queueId, patch, queueBefore.lastModified, namespace);
        result = { status: "완료", safeMessage: "메타데이터수정_APPLIED", externalCall: false };
      } else {
        result = await (input.executor ?? new DisabledAutomationExecutor()).execute(command);
      }
    } else {
      result = await (input.executor ?? new DisabledAutomationExecutor()).execute(command);
      if (result.queuePatch && queueBefore) {
        const patch = allowedQueuePatch(result.queuePatch);
        if (Object.keys(patch).length > 0) await input.repository.queue.update(command.queueId, patch, queueBefore.lastModified, namespace);
      }
    }
  } catch (error) {
    result = { status: "실패", safeMessage: safeFailureCode(error), externalCall: false };
  }

  const completedAt = toKstTimestamp();
  const queueAfter = command.queueId ? await input.repository.queue.find(command.queueId, namespace) : null;
  await input.repository.logs.append({
    commandId: command.commandId, queueId: command.queueId, command: command.command, status: result.status,
    safeMessage: result.safeMessage, before: safeJson(queueBefore), after: safeJson(queueAfter), startedAt, completedAt,
    externalCall: String(result.externalCall), details: result.status === "완료" ? "allowlisted_command_complete" : result.safeMessage
  });
  await input.repository.commands.update(command.commandId, {
    status: result.status, result: result.safeMessage, errorMemo: result.status === "실패" ? result.safeMessage : "", completedAt
  });
  return { processed: true as const, commandId: command.commandId, status: result.status };
}
