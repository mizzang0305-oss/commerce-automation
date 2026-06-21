export type ComfyUIWorkflowInput = {
  sceneId: string;
  kind: string;
  productName: string;
  caption: string;
  prompt: string;
  negativePrompt: string;
  durationSeconds: number;
  width: number;
  height: number;
  sourceImageSafeRef?: string;
  sourceImageLocalPath?: string;
  outputPrefix: string;
  seed: number;
  requiredSignals: string[];
  workflow: unknown;
};

export type ComfyUIPromptResult = {
  promptId: string;
  safeSummary: string;
};

export type ComfyUIPollOptions = {
  timeoutMs: number;
  pollIntervalMs: number;
};

export type ComfyUIHistoryOutput = {
  outputBasename?: string;
  mimeType?: string;
};

export type ComfyUIHistoryResult = {
  promptId: string;
  status: "completed" | "failed";
  outputs: ComfyUIHistoryOutput[];
  safeSummary: string;
};

export type ComfyUIOutputRef = {
  safeRef?: string;
  localPath?: string;
  outputBasename?: string;
  mimeType: string;
  durationSeconds?: number;
  safeSummary: string;
};

export interface ComfyUIClient {
  submitWorkflow(input: ComfyUIWorkflowInput): Promise<ComfyUIPromptResult>;
  waitForResult(promptId: string, options: ComfyUIPollOptions): Promise<ComfyUIHistoryResult>;
  resolveOutput(result: ComfyUIHistoryResult): Promise<ComfyUIOutputRef>;
}

export type HttpComfyUIClientInput = {
  baseUrl: string;
  fetchImpl?: typeof fetch;
};

export function createHttpComfyUIClient(input: HttpComfyUIClientInput): ComfyUIClient {
  const baseUrl = input.baseUrl.replace(/\/+$/, "");
  const fetchImpl = input.fetchImpl ?? fetch;

  return {
    submitWorkflow: async (workflowInput) => {
      const response = await fetchImpl(`${baseUrl}/prompt`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: workflowInput.workflow })
      });
      if (!response.ok) {
        throw new Error(`ComfyUI prompt submit failed with status ${response.status}`);
      }

      const data = await response.json();
      const promptId = promptIdFromResponse(data);
      if (!promptId) {
        throw new Error("ComfyUI prompt submit response did not include a prompt id");
      }

      return {
        promptId,
        safeSummary: "ComfyUI prompt was accepted without raw response logging."
      };
    },

    waitForResult: async (promptId, options) => {
      const deadline = Date.now() + options.timeoutMs;
      while (Date.now() < deadline) {
        const response = await fetchImpl(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
        if (!response.ok) {
          throw new Error(`ComfyUI history lookup failed with status ${response.status}`);
        }

        const data = await response.json();
        const outputs = outputsFromHistory(data, promptId);
        if (outputs.length > 0) {
          return {
            promptId,
            status: "completed",
            outputs,
            safeSummary: "ComfyUI prompt completed with output metadata."
          };
        }

        await sleep(options.pollIntervalMs);
      }

      throw new Error("ComfyUI prompt polling timed out");
    },

    resolveOutput: async (result) => {
      const firstVideo = result.outputs.find((output) => output.mimeType?.startsWith("video/"));
      if (!firstVideo?.outputBasename) {
        throw new Error("ComfyUI history did not include a video output basename");
      }

      return {
        safeRef: `safe:motion:comfyui_wan_i2v:${firstVideo.outputBasename}`,
        outputBasename: firstVideo.outputBasename,
        mimeType: firstVideo.mimeType ?? "video/mp4",
        safeSummary: "ComfyUI output resolved to a safe video reference."
      };
    }
  };
}

function promptIdFromResponse(data: unknown): string | null {
  const record = asRecord(data);
  const promptId = record?.prompt_id ?? record?.promptId;
  return typeof promptId === "string" && promptId.length > 0 ? promptId : null;
}

function outputsFromHistory(data: unknown, promptId: string): ComfyUIHistoryOutput[] {
  const root = asRecord(data);
  if (!root) return [];

  const promptRecord = asRecord(root[promptId]) ?? root;
  const outputs = asRecord(promptRecord.outputs);
  if (!outputs) return [];

  const parsedOutputs: ComfyUIHistoryOutput[] = [];
  for (const nodeOutput of Object.values(outputs)) {
    const node = asRecord(nodeOutput);
    const videos = Array.isArray(node?.videos) ? node.videos : [];
    for (const video of videos) {
      const videoRecord = asRecord(video);
      const filename = videoRecord?.filename;
      if (typeof filename === "string" && filename.length > 0) {
        parsedOutputs.push({
          outputBasename: filename,
          mimeType: mimeTypeForFilename(filename)
        });
      }
    }
  }

  return parsedOutputs;
}

function mimeTypeForFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".webm")) return "video/webm";
  if (lower.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
