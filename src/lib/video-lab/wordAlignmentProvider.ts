export type WordAlignmentToken = {
  word: string;
  start_seconds: number;
  end_seconds: number;
  confidence: number | null;
};

export type WordAlignmentRequest = {
  audio_path: string;
  language: "ko";
  model?: string;
  device?: "cpu" | "cuda";
  compute_type?: "int8" | "float16" | "float32";
};

export type WordAlignmentResult =
  | {
      status: "disabled";
      provider: "disabled";
      reason: "WHISPERX_NOT_CONFIGURED";
      words: [];
      external_calls: 0;
    }
  | {
      status: "completed";
      provider: "local_whisperx";
      language: "ko";
      words: WordAlignmentToken[];
      external_calls: 0;
    };

export interface WordAlignmentProvider {
  readonly name: "disabled" | "local_whisperx";
  align(request: WordAlignmentRequest): Promise<WordAlignmentResult>;
}

export class DisabledWordAlignmentProvider implements WordAlignmentProvider {
  readonly name = "disabled" as const;

  async align(request: WordAlignmentRequest): Promise<WordAlignmentResult> {
    void request;
    return {
      status: "disabled",
      provider: "disabled",
      reason: "WHISPERX_NOT_CONFIGURED",
      words: [],
      external_calls: 0
    };
  }
}

export type LocalWhisperXBridge = (
  request: Readonly<Required<WordAlignmentRequest>>
) => Promise<unknown>;

export class WhisperXLocalProvider implements WordAlignmentProvider {
  readonly name = "local_whisperx" as const;

  constructor(private readonly bridge: LocalWhisperXBridge) {}

  async align(request: WordAlignmentRequest): Promise<WordAlignmentResult> {
    if (!request.audio_path.trim()) throw new Error("VIDEO_LAB_AUDIO_PATH_REQUIRED");
    if (request.language !== "ko") throw new Error("VIDEO_LAB_KOREAN_ALIGNMENT_ONLY");

    const raw = await this.bridge({
      audio_path: request.audio_path,
      language: "ko",
      model: request.model?.trim() || "small",
      device: request.device ?? "cpu",
      compute_type: request.compute_type ?? "int8"
    });
    const words = parseBridgeWords(raw);
    if (words.length === 0) throw new Error("VIDEO_LAB_WHISPERX_WORDS_REQUIRED");

    return {
      status: "completed",
      provider: "local_whisperx",
      language: "ko",
      words,
      external_calls: 0
    };
  }
}

export { WhisperXLocalProvider as LocalWhisperXWordAlignmentProvider };

function parseBridgeWords(value: unknown): WordAlignmentToken[] {
  if (!value || typeof value !== "object" || !("words" in value) || !Array.isArray(value.words)) {
    throw new Error("VIDEO_LAB_WHISPERX_INVALID_OUTPUT");
  }

  const wordItems = value.words;
  let previousEnd = -1;
  return wordItems.map((item) => {
    if (!item || typeof item !== "object") throw new Error("VIDEO_LAB_WHISPERX_INVALID_WORD");
    const word = "word" in item && typeof item.word === "string" ? item.word.trim() : "";
    const start = "start_seconds" in item ? item.start_seconds : undefined;
    const end = "end_seconds" in item ? item.end_seconds : undefined;
    const confidence = "confidence" in item ? item.confidence : null;
    if (
      !word ||
      typeof start !== "number" ||
      !Number.isFinite(start) ||
      typeof end !== "number" ||
      !Number.isFinite(end) ||
      start < 0 ||
      end <= start ||
      start < previousEnd
    ) {
      throw new Error("VIDEO_LAB_WHISPERX_INVALID_WORD");
    }
    if (confidence !== null && (typeof confidence !== "number" || confidence < 0 || confidence > 1)) {
      throw new Error("VIDEO_LAB_WHISPERX_INVALID_CONFIDENCE");
    }
    previousEnd = end;
    return {
      word,
      start_seconds: start,
      end_seconds: end,
      confidence: confidence as number | null
    };
  });
}
