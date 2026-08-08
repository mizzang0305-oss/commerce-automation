import { buildCaptionTimeline } from "../video-lab/captionTimeline";
import type { WordAlignmentToken } from "../video-lab/wordAlignmentProvider";
import type { CaptionCueV1 } from "./types";

export function buildPopGroupCaptions(words: readonly WordAlignmentToken[]): CaptionCueV1[] {
  const base = buildCaptionTimeline(words, { max_chars: 18, max_duration_seconds: 2.4, max_gap_seconds: 0.55 });
  let cursor = 0;
  const groups: Array<{ tokens: readonly WordAlignmentToken[] }> = [];
  for (const cue of base) {
    const cueWords = words.slice(cursor, cursor + cue.words).map((word) => word.word.trim());
    const cueTokens = words.slice(cursor, cursor + cue.words);
    cursor += cue.words;
    for (let offset = 0; offset < cueWords.length; offset += 4) groups.push({ tokens: cueTokens.slice(offset, offset + 4) });
  }
  const cues = groups.map(({ tokens }, index) => {
    const cueWords = tokens.map((word) => word.word.trim());
    return { id: `cue-${String(index + 1).padStart(3, "0")}`, start: tokens[0].start, end: tokens[tokens.length - 1].end, text: cueWords.join(" "), words: cueWords, emphasisWord: cueWords.find((word) => word.length >= 3) };
  });
  validateCaptionTimeline(cues);
  return cues;
}

export function validateCaptionTimeline(cues: readonly CaptionCueV1[]): void {
  if (cues.length === 0) throw new Error("VIDEO_AUTOMATION_CAPTIONS_REQUIRED");
  let previousEnd = -1;
  for (const cue of cues) {
    if (cue.start < 0 || cue.end <= cue.start || cue.start < previousEnd || cue.end - cue.start > 2.4 || cue.text.length > 18 || cue.words.length < 1 || cue.words.length > 4) {
      throw new Error("VIDEO_AUTOMATION_CAPTION_TIMELINE_INVALID");
    }
    previousEnd = cue.end;
  }
}
