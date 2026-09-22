import type { WordAlignmentToken } from "../video-lab/wordAlignmentProvider";
import type { CaptionCueV1 } from "./types";

export function buildPopGroupCaptions(words: readonly WordAlignmentToken[]): CaptionCueV1[] {
  const groups: Array<{ tokens: WordAlignmentToken[] }> = [];
  let current: WordAlignmentToken[] = [];
  for (const token of words) {
    const candidate = [...current, token];
    const previous = current[current.length - 1];
    const exceedsContract = candidate.length > 4 || candidate.map((word) => word.word.trim()).join(" ").length > 18 || token.end - candidate[0].start > 2.4 || (previous ? token.start - previous.end > 0.55 : false);
    if (current.length && exceedsContract) { groups.push({ tokens: current }); current = [token]; }
    else current = candidate;
  }
  if (current.length) groups.push({ tokens: current });
  const balancedGroups = rebalanceSingletonGroups(groups);
  const cues = balancedGroups.map(({ tokens }, index) => {
    const cueWords = tokens.map((word) => word.word.trim());
    return { id: `cue-${String(index + 1).padStart(3, "0")}`, start: tokens[0].start, end: tokens[tokens.length - 1].end, text: cueWords.join(" "), words: cueWords, emphasisWord: cueWords.find((word) => word.length >= 3) };
  });
  validateCaptionTimeline(cues);
  return cues;
}

function rebalanceSingletonGroups(groups: Array<{ tokens: WordAlignmentToken[] }>): Array<{ tokens: WordAlignmentToken[] }> {
  for (let index = 0; index < groups.length; index += 1) {
    const current = groups[index];
    if (current.tokens.length !== 1) continue;
    const previous = groups[index - 1];
    if (previous && current.tokens[0].start - previous.tokens[previous.tokens.length - 1].end <= 0.55) {
      if (fitsCaptionContract([...previous.tokens, ...current.tokens])) {
        previous.tokens.push(...current.tokens); groups.splice(index, 1); index -= 1; continue;
      }
      if (previous.tokens.length === 4 && fitsCaptionContract([previous.tokens[previous.tokens.length - 1], ...current.tokens])) {
        current.tokens.unshift(previous.tokens.pop()!); continue;
      }
    }
    const next = groups[index + 1];
    if (next && next.tokens[0].start - current.tokens[0].end <= 0.55) {
      if (fitsCaptionContract([...current.tokens, ...next.tokens])) {
        current.tokens.push(...next.tokens); groups.splice(index + 1, 1);
      } else if (next.tokens.length === 4 && fitsCaptionContract([...current.tokens, next.tokens[0]])) current.tokens.push(next.tokens.shift()!);
    }
  }
  return groups;
}

function fitsCaptionContract(tokens: readonly WordAlignmentToken[]): boolean {
  return tokens.length >= 1 && tokens.length <= 4 && tokens[tokens.length - 1].end - tokens[0].start <= 2.4 && tokens.map((word) => word.word.trim()).join(" ").length <= 18;
}

export function validateCaptionTimeline(cues: readonly CaptionCueV1[]): void {
  if (cues.length === 0) throw new Error("VIDEO_AUTOMATION_CAPTIONS_REQUIRED");
  let previousEnd = -1;
  for (const cue of cues) {
    if (cue.start < 0) throw new Error("VIDEO_AUTOMATION_CAPTION_NEGATIVE_START");
    if (cue.end <= cue.start) throw new Error("VIDEO_AUTOMATION_CAPTION_DURATION_INVALID");
    if (cue.start < previousEnd) throw new Error("VIDEO_AUTOMATION_CAPTION_TIMELINE_OVERLAP");
    if (cue.end - cue.start > 2.4) throw new Error("VIDEO_AUTOMATION_CAPTION_DURATION_TOO_LONG");
    if (cue.text.length > 18) throw new Error("VIDEO_AUTOMATION_CAPTION_TEXT_TOO_LONG");
    if (cue.words.length < 1 || cue.words.length > 4) throw new Error("VIDEO_AUTOMATION_CAPTION_WORD_COUNT_INVALID");
    previousEnd = cue.end;
  }
}

export function restoreKnownCaptionTokens<T extends WordAlignmentToken>(words: readonly T[], knownPhrases: readonly string[]): T[] {
  const knownTokens = [...new Set(knownPhrases.flatMap((phrase) => phrase.split(/\s+/u)).map(normalizeKoreanToken).filter((token) => token.length >= 2))];
  return words.map((word) => {
    const normalized = normalizeKoreanToken(word.word);
    const replacement = knownTokens.find((token) => token.length === normalized.length && token[token.length - 1] === normalized[normalized.length - 1] && editDistance(token, normalized) === 1);
    if (!replacement) return { ...word };
    const prefix = word.word.match(/^[^가-힣]*/u)?.[0] ?? "";
    const suffix = word.word.match(/[^가-힣]*$/u)?.[0] ?? "";
    return { ...word, word: `${prefix}${replacement}${suffix}` };
  });
}

function normalizeKoreanToken(value: string): string { return value.replace(/[^가-힣]/gu, ""); }
function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    let diagonal = row[0]; row[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const above = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (left[i - 1] === right[j - 1] ? 0 : 1)); diagonal = above;
    }
  }
  return row[right.length];
}
