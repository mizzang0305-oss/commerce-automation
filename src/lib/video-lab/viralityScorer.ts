import { CREATIVE_SCORE_CONFIG } from "./creativeScoreConfig";
import type {
  CreativeBlocker,
  CreativeCandidate,
  CreativeScoreBreakdown,
  CreativeScoreResult
} from "./types";

const SENTENCE_BOUNDARY = /[.!?。！？]|(?:다|요)[\s\n]+/u;
const TOKEN_PATTERN = /[가-힣A-Za-z0-9]+/gu;

export function scoreCreativeCandidate(candidate: CreativeCandidate): CreativeScoreResult {
  const hook = normalize(candidate.hook);
  const script = normalize(candidate.script);
  const productName = normalize(candidate.product_name);
  const disclosure = normalize(candidate.disclosure_text ?? "");
  const combined = `${hook} ${script}`.trim();
  const blockers: CreativeBlocker[] = [];

  if (!script) blockers.push("EMPTY_SCRIPT");
  if (!hook) blockers.push("MISSING_HOOK");
  if (
    candidate.disclosure_required &&
    disclosure.length < CREATIVE_SCORE_CONFIG.disclosureMinimumChars
  ) {
    blockers.push("MISSING_DISCLOSURE");
  }

  const hasExplicitOverclaim = CREATIVE_SCORE_CONFIG.explicitOverclaimPatterns.some((pattern) =>
    pattern.test(combined)
  );
  if (hasExplicitOverclaim) blockers.push("EXPLICIT_OVERCLAIM");

  const normalizedProduct = compact(productName);
  const normalizedCombined = compact(combined);
  if (!normalizedProduct || !normalizedCombined.includes(normalizedProduct)) {
    blockers.push("PRODUCT_NAME_MISSING");
  }

  const anchors = (candidate.product_anchors ?? []).map(normalize).filter(Boolean);
  const contentWithoutProduct = normalizedCombined.replace(normalizedProduct, "");
  const anchorMatched = anchors.some((anchor) => contentWithoutProduct.includes(compact(anchor)));
  if (productName && !anchorMatched) blockers.push("UNRELATED_SCRIPT");

  const firstSentence = script.split(SENTENCE_BOUNDARY)[0]?.trim() ?? "";
  if (firstSentence.length > CREATIVE_SCORE_CONFIG.firstSentenceMaxChars) {
    blockers.push("FIRST_SENTENCE_TOO_LONG");
  }
  if (candidate.claims_personal_experience && !candidate.personal_experience_evidence) {
    blockers.push("UNVERIFIED_PERSONAL_EXPERIENCE");
  }

  const dimensions = calculateDimensions({
    hook,
    script,
    combined,
    productName,
    anchors,
    hasExplicitOverclaim
  });
  const positiveScore = round2(
    Object.entries(CREATIVE_SCORE_CONFIG.positiveWeights).reduce(
      (sum, [dimension, weight]) =>
        sum + dimensions[dimension as keyof CreativeScoreBreakdown] * weight,
      0
    )
  );
  const riskPenalty = round2(
    Object.entries(CREATIVE_SCORE_CONFIG.riskWeights).reduce(
      (sum, [dimension, weight]) =>
        sum + dimensions[dimension as keyof CreativeScoreBreakdown] * weight,
      0
    )
  );
  const totalScore = clamp(round2(positiveScore - riskPenalty));

  return {
    version: "video-lab-creative-score-v1",
    candidate_id: candidate.candidate_id,
    passed: blockers.length === 0 && totalScore >= CREATIVE_SCORE_CONFIG.passingScore,
    blockers: unique(blockers),
    dimensions,
    positive_score: positiveScore,
    risk_penalty: riskPenalty,
    total_score: totalScore,
    SAFE_TO_UPLOAD: false,
    SAFE_TO_PUBLIC_UPLOAD: false
  };
}

type DimensionInput = {
  hook: string;
  script: string;
  combined: string;
  productName: string;
  anchors: string[];
  hasExplicitOverclaim: boolean;
};

function calculateDimensions(input: DimensionInput): CreativeScoreBreakdown {
  const hookLengthScore = rangeScore(input.hook.length, 8, 28);
  const hookPatternScore = patternCoverage(input.hook, [
    ...CREATIVE_SCORE_CONFIG.curiosityPatterns,
    /\d/u,
    /[!！]/u
  ]);
  const hookStrength = clamp(hookLengthScore * 0.65 + hookPatternScore * 0.35);
  const curiosity = patternCoverage(input.combined, CREATIVE_SCORE_CONFIG.curiosityPatterns);
  const problemClarity = patternCoverage(input.script, CREATIVE_SCORE_CONFIG.problemPatterns);
  const benefitPattern = patternCoverage(input.script, CREATIVE_SCORE_CONFIG.benefitPatterns);
  const anchorCoverage = input.anchors.length
    ? (input.anchors.filter((anchor) => compact(input.combined).includes(compact(anchor))).length /
        input.anchors.length) *
      100
    : 0;
  const benefitSpecificity = clamp(
    benefitPattern * 0.55 + anchorCoverage * 0.3 + (/\d/u.test(input.script) ? 15 : 0)
  );
  const purchaseIntent = patternCoverage(input.script, CREATIVE_SCORE_CONFIG.purchasePatterns);
  const sentenceCount = input.script.split(SENTENCE_BOUNDARY).filter((part) => part.trim()).length;
  const retention = clamp(
    hookStrength * 0.45 +
      curiosity * 0.2 +
      rangeScore(sentenceCount, 3, 7) * 0.2 +
      (input.script.length <= 320 ? 15 : 0)
  );
  const averageSentenceLength = average(
    input.script
      .split(SENTENCE_BOUNDARY)
      .map((part) => part.trim().length)
      .filter((length) => length > 0)
  );
  const clarity = clamp(100 - Math.max(0, averageSentenceLength - 22) * 2.5);
  const repetitionRisk = calculateRepetitionRisk(input.combined);
  const softOverclaimCount = [
    /최고/gu,
    /완벽/gu,
    /확실/gu,
    /즉시/gu,
    /무조건/gu
  ].reduce((sum, pattern) => sum + (input.combined.match(pattern)?.length ?? 0), 0);
  const overclaimRisk = input.hasExplicitOverclaim ? 100 : clamp(softOverclaimCount * 22);

  return {
    hook_strength: round2(hookStrength),
    curiosity: round2(curiosity),
    problem_clarity: round2(problemClarity),
    benefit_specificity: round2(benefitSpecificity),
    purchase_intent: round2(purchaseIntent),
    retention: round2(retention),
    clarity: round2(clarity),
    overclaim_risk: round2(overclaimRisk),
    repetition_risk: round2(repetitionRisk)
  };
}

function calculateRepetitionRisk(text: string): number {
  const tokens = (text.toLowerCase().match(TOKEN_PATTERN) ?? []).filter((token) => token.length > 1);
  if (tokens.length < 4) return 0;
  const uniqueCount = new Set(tokens).size;
  const duplicateRatio = 1 - uniqueCount / tokens.length;
  const maxFrequency = Math.max(
    ...[...new Set(tokens)].map((token) => tokens.filter((item) => item === token).length)
  );
  return clamp(duplicateRatio * 100 + Math.max(0, maxFrequency - 2) * 12);
}

function patternCoverage(text: string, patterns: readonly RegExp[]): number {
  if (!text || patterns.length === 0) return 0;
  const matches = patterns.filter((pattern) => pattern.test(text)).length;
  return clamp((matches / Math.min(patterns.length, 4)) * 100);
}

function rangeScore(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= minimum && value <= maximum) return 100;
  if (value < minimum) return clamp((value / minimum) * 100);
  return clamp(100 - (value - maximum) * 4);
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 100;
}

function normalize(value: string): string {
  return typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
}

function compact(value: string): string {
  return normalize(value).toLowerCase().replace(/[^가-힣a-z0-9]/gu, "");
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
