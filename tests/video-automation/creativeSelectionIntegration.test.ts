import { describe, expect, test } from "vitest";
import { generateDeterministicCreativeCandidates } from "@/lib/video-automation/creativeCandidates";
import { selectTopPassingCreative } from "@/lib/video-automation/creativeSelection";
import type { ProductVideoAutomationInput } from "@/lib/video-automation/types";

const input: ProductVideoAutomationInput = { runId: "run", product: { productKey: "desk-cable", rawProductName: "케이블 정리함", canonicalProductName: "케이블 정리함", aliases: ["선 정리함"], anchors: ["케이블", "정리", "책상", "고정"], category: "전자액세서리", imagePaths: ["1", "2", "3", "4", "5"] }, creative: { candidateCount: 3, language: "ko" }, mode: "local_review_only" };

describe("creative selection integration", () => {
  test("generates three distinct candidates and selects rank-one passing creative", () => {
    const candidates = generateDeterministicCreativeCandidates(input);
    const result = selectTopPassingCreative(input.product.productKey, candidates);
    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.angle)).size).toBe(3);
    expect(result.candidates.find((candidate) => candidate.selected)).toMatchObject({ rank: 1, score: { passed: true } });
  });
  test("never selects a blocked candidate", () => {
    const candidates = generateDeterministicCreativeCandidates(input);
    candidates[0] = { ...candidates[0], hook: "무조건 100% 성공하는 완벽한 상품", script: `${candidates[0].script} 무조건 보장합니다.` };
    const result = selectTopPassingCreative(input.product.productKey, candidates);
    expect(result.candidates.find((entry) => entry.candidate.id === candidates[0].id)?.selected).toBe(false);
  });
});
