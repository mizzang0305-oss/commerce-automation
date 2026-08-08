import type { WordAlignmentToken } from "./wordAlignmentProvider";

export type CaptionCue = {
  cue_id: string;
  text: string;
  start_seconds: number;
  end_seconds: number;
  words: number;
};

export type CaptionTimelineOptions = {
  max_chars?: number;
  max_duration_seconds?: number;
  max_gap_seconds?: number;
};

export function buildCaptionTimeline(
  words: readonly WordAlignmentToken[],
  options: CaptionTimelineOptions = {}
): CaptionCue[] {
  const maxChars = finitePositive(options.max_chars, 18);
  const maxDuration = finitePositive(options.max_duration_seconds, 2.4);
  const maxGap = finitePositive(options.max_gap_seconds, 0.55);
  const cues: CaptionCue[] = [];
  let group: WordAlignmentToken[] = [];

  for (const word of words) {
    validateWord(word, group.length ? group[group.length - 1] : undefined);
    const prospective = [...group, word];
    const text = joinWords(prospective);
    const duration = word.end_seconds - prospective[0].start_seconds;
    const gap = group.length ? word.start_seconds - group[group.length - 1].end_seconds : 0;
    if (group.length && (text.length > maxChars || duration > maxDuration || gap > maxGap)) {
      cues.push(toCue(group, cues.length));
      group = [word];
    } else {
      group = prospective;
    }
  }
  if (group.length) cues.push(toCue(group, cues.length));
  return cues;
}

function toCue(words: WordAlignmentToken[], index: number): CaptionCue {
  return {
    cue_id: `cue-${String(index + 1).padStart(3, "0")}`,
    text: joinWords(words),
    start_seconds: words[0].start_seconds,
    end_seconds: words[words.length - 1].end_seconds,
    words: words.length
  };
}

function joinWords(words: readonly WordAlignmentToken[]): string {
  return words.map((word) => word.word.trim()).filter(Boolean).join(" ");
}

function validateWord(word: WordAlignmentToken, previous?: WordAlignmentToken): void {
  if (
    !word.word.trim() ||
    !Number.isFinite(word.start_seconds) ||
    !Number.isFinite(word.end_seconds) ||
    word.start_seconds < 0 ||
    word.end_seconds <= word.start_seconds ||
    (previous && word.start_seconds < previous.end_seconds)
  ) {
    throw new Error("VIDEO_LAB_INVALID_ALIGNMENT_TIMELINE");
  }
}

function finitePositive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
