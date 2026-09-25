import { createHash } from "node:crypto";

const compact = (value: string) => value.toLocaleLowerCase("ko").replace(/[^가-힣a-z0-9]/gu, "");
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

/** A diagnostic release gate. ASR is evidence, not a substitute for independent listening. */
export function evaluateFreshAudioIdentity(input: {
  canonicalProductName: string;
  asrTranscript: string;
  captionText: string;
  narration: string;
  historicalNarration?: string;
  historicalNarrationSha256?: string;
  audioSha256: string;
  historicalAudioSha256: string;
  requiredExactTerms: string[];
  pronunciationAliases?: Record<string, string>;
}): { passed: boolean; blockers: string[]; asrNameMatch: boolean; captionNameMatch: boolean } {
  const blockers: string[] = [];
  const canonical = input.canonicalProductName.trim();
  const expectedSpoken = Object.entries(input.pronunciationAliases ?? {}).reduce(
    (name, [written, spoken]) => name.split(written).join(spoken), canonical
  );
  const asr = compact(input.asrTranscript);
  const captions = compact(input.captionText);
  const asrNameMatch = Boolean(canonical) && asr.includes(compact(expectedSpoken)) &&
    input.requiredExactTerms.every((term) => asr.includes(compact(input.pronunciationAliases?.[term] ?? term)));
  const captionNameMatch = Boolean(canonical) && captions.includes(compact(canonical)) &&
    input.requiredExactTerms.every((term) => captions.includes(compact(term)));
  if (!asrNameMatch) blockers.push("ASR_CANONICAL_NAME_MISMATCH");
  if (!captionNameMatch) blockers.push("CAPTION_CANONICAL_NAME_MISMATCH");
  if (!/^[a-f0-9]{64}$/u.test(input.audioSha256) || input.audioSha256 === input.historicalAudioSha256) blockers.push("HISTORICAL_AUDIO_HASH_REUSED");
  const historicalNarrationSha256 = input.historicalNarrationSha256 ?? (input.historicalNarration === undefined ? "" : sha256(input.historicalNarration));
  if (!/^[a-f0-9]{64}$/u.test(historicalNarrationSha256) || sha256(input.narration) === historicalNarrationSha256) blockers.push("HISTORICAL_NARRATION_HASH_REUSED");
  return { passed: blockers.length === 0, blockers, asrNameMatch, captionNameMatch };
}
