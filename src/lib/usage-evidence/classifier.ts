import { SUPPORTED_USAGE_EVIDENCE_USE_CASES, type UsageEvidenceUseCase } from "./taxonomy";

export type UseCaseClassification = {
  useCase: UsageEvidenceUseCase;
  matchedTerms: string[];
  matchedCategory: string;
  classificationRuleId: string;
  reason: "priority_specificity_category" | "no_unambiguous_match";
};

export function classifyUsageEvidenceUseCase(input: { productName: string; categoryPath?: string; sourceKeyword?: string }): UseCaseClassification {
  const nameAndKeyword = normalize(`${input.productName} ${input.sourceKeyword ?? ""}`);
  const category = normalize(input.categoryPath ?? "");
  const matches = Object.entries(SUPPORTED_USAGE_EVIDENCE_USE_CASES).flatMap(([useCase, definition]) => {
    const positive = definition.positiveTerms.filter((term) => nameAndKeyword.includes(normalize(term)));
    const negative = definition.negativeTerms.some((term) => nameAndKeyword.includes(normalize(term)) || category.includes(normalize(term)));
    const blockedCategory = definition.categoryBlocklist.some((term) => category.includes(normalize(term)));
    const categoryMatches = definition.categoryAllowlist.filter((term) => category.includes(normalize(term)));
    if (positive.length === 0 || negative || blockedCategory) return [];
    return [{ useCase: useCase as UsageEvidenceUseCase, positive, categoryMatches, definition }];
  }).sort((left, right) => right.definition.priority - left.definition.priority || right.positive.length - left.positive.length || right.categoryMatches.length - left.categoryMatches.length || left.useCase.localeCompare(right.useCase));
  const winner = matches[0];
  if (!winner) return { useCase: "unsupported", matchedTerms: [], matchedCategory: "", classificationRuleId: "unsupported-v2", reason: "no_unambiguous_match" };
  const runnerUp = matches[1];
  if (runnerUp && runnerUp.definition.priority === winner.definition.priority && runnerUp.positive.length === winner.positive.length && runnerUp.categoryMatches.length === winner.categoryMatches.length) {
    return { useCase: "unsupported", matchedTerms: [...new Set([...winner.positive, ...runnerUp.positive])], matchedCategory: "", classificationRuleId: "ambiguous-v2", reason: "no_unambiguous_match" };
  }
  return { useCase: winner.useCase, matchedTerms: winner.positive, matchedCategory: winner.categoryMatches[0] ?? "", classificationRuleId: winner.definition.ruleId, reason: "priority_specificity_category" };
}

function normalize(value: string) { return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, ""); }
