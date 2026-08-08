import type { CreativeScoreDimension } from "./types";

export const CREATIVE_SCORE_CONFIG = Object.freeze({
  version: "video-lab-creative-score-v1",
  firstSentenceMaxChars: 60,
  disclosureMinimumChars: 5,
  passingScore: 55,
  positiveWeights: {
    hook_strength: 0.22,
    curiosity: 0.12,
    problem_clarity: 0.14,
    benefit_specificity: 0.16,
    purchase_intent: 0.1,
    retention: 0.16,
    clarity: 0.1
  } satisfies Partial<Record<CreativeScoreDimension, number>>,
  riskWeights: {
    overclaim_risk: 0.15,
    repetition_risk: 0.1
  } satisfies Partial<Record<CreativeScoreDimension, number>>,
  explicitOverclaimPatterns: [
    /100\s*%/iu,
    /무조건/iu,
    /완치/iu,
    /기적/iu,
    /절대\s*(?:실패|후회|고장)/iu,
    /세계\s*최고/iu,
    /부작용\s*(?:0|없)/iu
  ],
  curiosityPatterns: [/왜/iu, /비밀/iu, /결과/iu, /진짜/iu, /모르면/iu, /\?/u],
  problemPatterns: [
    /불편/iu,
    /문제/iu,
    /걱정/iu,
    /힘들/iu,
    /번거/iu,
    /시간/iu,
    /좁/iu,
    /냄새/iu,
    /정리/iu
  ],
  benefitPatterns: [
    /빠르/iu,
    /간편/iu,
    /줄여/iu,
    /절약/iu,
    /깨끗/iu,
    /편하/iu,
    /한\s*번에/iu,
    /공간/iu
  ],
  purchasePatterns: [/가격/iu, /가성비/iu, /추천/iu, /구매/iu, /장바구니/iu, /필요/iu]
});
