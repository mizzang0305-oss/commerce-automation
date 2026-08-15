import {
  YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION,
  type ClaimType,
  type ContentSection,
  type ContentStructureEvidence,
  type CreativeEvidence,
  type CtaEvidence,
  type HookEvidence,
  type HookFamily,
  type SourceTimeRef,
  type VisionEvidence,
  type YouTubeSourceSnapshot,
  type YouTubeTranscript,
} from "./types";
import { assertSourceBinding, sha256 } from "./source";

const HOOK_WINDOW_SECONDS = 10;
const MAX_EVIDENCE_TEXT_LENGTH = 280;

const HOOK_RULES: ReadonlyArray<{ family: HookFamily; pattern: RegExp; confidence: number }> = [
  { family: "question", pattern: /\?|왜|어떻게|무엇|알고\s*있|did you|how|why|what/i, confidence: 0.9 },
  { family: "warning", pattern: /주의|경고|절대|하면\s*안|실수|don't|never|warning/i, confidence: 0.88 },
  { family: "before_after", pattern: /전후|비포|애프터|before.{0,20}after|바꾸기\s*전/i, confidence: 0.86 },
  { family: "problem", pattern: /문제|불편|고민|막히|어렵|실패|problem|struggl|pain/i, confidence: 0.84 },
  { family: "number_list", pattern: /(^|\s)\d+\s*(가지|개|단계|ways|tips|steps)/i, confidence: 0.86 },
  { family: "benefit", pattern: /효과|장점|빠르게|쉽게|절약|개선|benefit|save|faster|easier/i, confidence: 0.82 },
  { family: "demonstration", pattern: /보여|직접|테스트|시연|해볼게|demo|watch this|let me show/i, confidence: 0.82 },
  { family: "curiosity", pattern: /비밀|놀라|사실은|결과는|궁금|secret|surpris|truth/i, confidence: 0.78 },
];

const SECTION_RULES: ReadonlyArray<{ section: ContentSection; pattern: RegExp }> = [
  { section: "PROBLEM", pattern: /문제|불편|고민|실패|어렵|problem|pain|struggl/i },
  { section: "REVEAL", pattern: /정답|핵심|비밀|알고\s*보니|결과|reveal|answer|turns out/i },
  { section: "DEMONSTRATION", pattern: /보여|직접|시연|테스트|사용해|demo|watch|try this/i },
  { section: "BENEFIT", pattern: /효과|장점|절약|빠르게|쉽게|개선|benefit|save|faster|easier/i },
  { section: "PROOF", pattern: /증명|후기|수치|결과|비교|검증|proof|result|tested/i },
  { section: "CTA", pattern: /지금|확인(?:해|하세요|해\s*보)|클릭|구독|팔로우|링크|구매|써\s*보|try|click|subscribe|follow|buy|link/i },
];

const TOPIC_STOP_WORDS = new Set([
  "그리고", "하지만", "그래서", "이것", "저것", "오늘", "정말", "바로", "with", "this", "that", "your", "from", "have", "will", "about",
]);

export function analyzeCreativeEvidence(input: {
  snapshot: YouTubeSourceSnapshot;
  transcript: YouTubeTranscript;
  visionEvidence?: readonly VisionEvidence[];
}): CreativeEvidence {
  const { snapshot, transcript } = input;
  assertSourceBinding(snapshot, transcript);

  const hook = extractHook(transcript);
  const structure = extractContentStructure(transcript, hook);
  const cta = extractCta(transcript, snapshot.durationSeconds);
  const sourceRefs = buildSourceRefs(transcript);
  const topicTags = extractTopicTags(snapshot, transcript);
  const claimTypes = extractClaimTypes(structure);
  const totalChars = transcript.segments.reduce((sum, segment) => sum + segment.text.length, 0);
  const totalWords = transcript.segments.reduce(
    (sum, segment) => sum + segment.text.split(/\s+/u).filter(Boolean).length,
    0,
  );
  const duration = inferDuration(snapshot, transcript);
  const confidenceParts = [hook.confidence, ...structure.map((item) => item.confidence)];
  const confidence = round(
    confidenceParts.reduce((sum, item) => sum + item, 0) / Math.max(confidenceParts.length, 1),
  );

  const sectionText = (section: ContentSection): string | undefined => {
    const match = structure.find((item) => item.section === section)?.sourceRefs[0];
    if (!match) return undefined;
    return transcript.segments.find((segment) => segment.startSeconds === match.startSeconds)?.text.slice(
      0,
      MAX_EVIDENCE_TEXT_LENGTH,
    );
  };

  const evidenceSeed = `${snapshot.provenance.sourceFingerprint}:${transcript.transcriptFingerprint}:${YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION}`;

  return {
    evidenceId: `ytci:${sha256(evidenceSeed).slice(0, 24)}`,
    sourceId: snapshot.sourceId,
    videoId: snapshot.videoId,
    channelId: snapshot.channelId,
    observedAt: snapshot.observedAt,
    analysisVersion: YOUTUBE_INTELLIGENCE_ANALYSIS_VERSION,
    hook,
    ...(sectionText("PROBLEM") ? { problemStatement: sectionText("PROBLEM") } : {}),
    ...(sectionText("REVEAL") ? { reveal: sectionText("REVEAL") } : {}),
    ...(sectionText("DEMONSTRATION")
      ? { demonstration: sectionText("DEMONSTRATION") }
      : {}),
    ...(sectionText("BENEFIT") ? { benefit: sectionText("BENEFIT") } : {}),
    ...(cta ? { cta } : {}),
    structure,
    topicTags,
    visualPatterns: uniqueSorted((input.visionEvidence ?? []).map((item) => item.pattern)),
    claimTypes,
    ...(duration > 0 ? { captionDensityCharsPerSecond: round(totalChars / duration) } : {}),
    ...(duration > 0 ? { speechDensityWordsPerSecond: round(totalWords / duration) } : {}),
    scenePacing: "unknown",
    confidence,
    rawMediaReuseAllowed: false,
    sourceRefs,
    provenance: snapshot.provenance,
  };
}

export function extractHook(transcript: YouTubeTranscript): HookEvidence {
  const hookSegments = transcript.segments.filter((segment) => segment.startSeconds <= HOOK_WINDOW_SECONDS);
  if (hookSegments.length === 0) {
    return { family: "unknown", timingBucket: "none", confidence: 0.1 };
  }

  const combined = hookSegments.map((segment) => segment.text).join(" ").slice(0, MAX_EVIDENCE_TEXT_LENGTH);
  const matched = HOOK_RULES.find((rule) => rule.pattern.test(combined));
  const first = hookSegments[0]!;
  const last = hookSegments[hookSegments.length - 1]!;
  const endSeconds = last.startSeconds + (last.durationSeconds ?? 0);

  return {
    family: matched?.family ?? "unknown",
    text: combined,
    startSeconds: first.startSeconds,
    endSeconds,
    timingBucket: timingBucket(first.startSeconds),
    confidence: matched?.confidence ?? 0.35,
  };
}

export function extractContentStructure(
  transcript: YouTubeTranscript,
  hook = extractHook(transcript),
): ContentStructureEvidence[] {
  const sections: ContentStructureEvidence[] = [];
  if (hook.startSeconds !== undefined) {
    sections.push({
      section: "HOOK",
      confidence: hook.confidence,
      sourceRefs: [{ startSeconds: hook.startSeconds, endSeconds: hook.endSeconds }],
    });
  }

  for (const segment of transcript.segments) {
    const rule = SECTION_RULES.find((candidate) => candidate.pattern.test(segment.text));
    const section = rule?.section ?? "CONTEXT";
    const existing = sections.find((item) => item.section === section);
    const sourceRef = segmentRef(segment);
    if (existing) {
      if (existing.sourceRefs.length < 3) existing.sourceRefs.push(sourceRef);
    } else {
      sections.push({
        section,
        confidence: rule ? 0.74 : 0.45,
        sourceRefs: [sourceRef],
      });
    }
  }

  return sections.sort(
    (left, right) => left.sourceRefs[0]!.startSeconds - right.sourceRefs[0]!.startSeconds,
  );
}

export function extractCta(
  transcript: YouTubeTranscript,
  declaredDuration?: number,
): CtaEvidence | undefined {
  const ctaPattern = SECTION_RULES.find((rule) => rule.section === "CTA")!.pattern;
  const segment = transcript.segments.find((candidate) => ctaPattern.test(candidate.text));
  if (!segment) return undefined;
  const duration = declaredDuration ?? inferDuration(undefined, transcript);
  const ratio = duration > 0 ? segment.startSeconds / duration : 1;
  return {
    text: segment.text.slice(0, MAX_EVIDENCE_TEXT_LENGTH),
    startSeconds: segment.startSeconds,
    timing: ratio <= 0.33 ? "early" : ratio <= 0.75 ? "middle" : "late",
    confidence: 0.78,
  };
}

function extractTopicTags(
  snapshot: YouTubeSourceSnapshot,
  transcript: YouTubeTranscript,
): string[] {
  const text = `${snapshot.title} ${transcript.segments.map((segment) => segment.text).join(" ")}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ");
  const counts = new Map<string, number>();
  for (const word of text.split(/\s+/u)) {
    if (word.length < 3 || TOPIC_STOP_WORDS.has(word)) continue;
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([word]) => word);
}

function extractClaimTypes(structure: readonly ContentStructureEvidence[]): ClaimType[] {
  const mapping: Partial<Record<ContentSection, ClaimType>> = {
    PROBLEM: "problem",
    BENEFIT: "benefit",
    DEMONSTRATION: "demonstration",
    PROOF: "proof",
    REVEAL: "instruction",
  };
  const types = structure.flatMap((item) => (mapping[item.section] ? [mapping[item.section]!] : []));
  return types.length > 0 ? uniqueSorted(types) : ["unknown"];
}

function buildSourceRefs(transcript: YouTubeTranscript): SourceTimeRef[] {
  if (transcript.segments.length === 0) return [];
  const first = transcript.segments[0]!;
  const last = transcript.segments[transcript.segments.length - 1]!;
  return [
    {
      startSeconds: first.startSeconds,
      endSeconds: last.startSeconds + (last.durationSeconds ?? 0),
    },
  ];
}

function inferDuration(
  snapshot: Pick<YouTubeSourceSnapshot, "durationSeconds"> | undefined,
  transcript: YouTubeTranscript,
): number {
  if (snapshot?.durationSeconds && snapshot.durationSeconds > 0) return snapshot.durationSeconds;
  const last = transcript.segments[transcript.segments.length - 1];
  return last ? last.startSeconds + (last.durationSeconds ?? 0) : 0;
}

function segmentRef(segment: { startSeconds: number; durationSeconds?: number }): SourceTimeRef {
  return {
    startSeconds: segment.startSeconds,
    ...(segment.durationSeconds !== undefined
      ? { endSeconds: segment.startSeconds + segment.durationSeconds }
      : {}),
  };
}

function timingBucket(startSeconds: number): HookEvidence["timingBucket"] {
  if (startSeconds <= 1) return "first_1s";
  if (startSeconds <= 3) return "first_3s";
  if (startSeconds <= 5) return "first_5s";
  if (startSeconds <= 10) return "first_10s";
  return "after_10s";
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort();
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
