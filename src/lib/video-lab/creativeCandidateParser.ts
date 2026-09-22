import type { CreativeCandidate } from "./types";

const REQUIRED_STRINGS = ["id", "productName", "angle", "hook", "script"] as const;
const OPTIONAL_STRINGS = [
  "canonicalProductName",
  "productCategory",
  "cta",
  "disclosure",
  "duplicateKey"
] as const;
const OPTIONAL_BOOLEANS = [
  "disclosureRequired",
  "claimsPersonalExperience",
  "personalExperienceEvidence"
] as const;
const OPTIONAL_STRING_ARRAYS = ["productAliases", "productAnchors"] as const;

export type CreativeCandidateParseResult =
  | { success: true; candidate: CreativeCandidate; issues: readonly [] }
  | { success: false; candidate: CreativeCandidate; issues: readonly string[] };

export function parseCreativeCandidate(
  input: unknown,
  fallbackId = "INVALID_CANDIDATE"
): CreativeCandidateParseResult {
  const empty: CreativeCandidate = {
    id: fallbackId,
    productName: "",
    angle: "",
    hook: "",
    script: ""
  };
  if (!isRecord(input)) {
    return { success: false, candidate: empty, issues: ["candidate must be an object"] };
  }

  const issues: string[] = [];
  const candidate = { ...empty } as CreativeCandidate;
  for (const key of REQUIRED_STRINGS) {
    const value = input[key];
    const mayBeEmptyForBusinessBlocker = key === "hook" || key === "script";
    if (typeof value !== "string" || (!mayBeEmptyForBusinessBlocker && value.trim().length === 0)) {
      issues.push(`${key} must be ${mayBeEmptyForBusinessBlocker ? "a string" : "a non-empty string"}`);
      continue;
    }
    candidate[key] = value.trim();
  }
  if (typeof input.id === "string" && input.id.trim()) candidate.id = input.id.trim();

  for (const key of OPTIONAL_STRINGS) {
    const value = input[key];
    if (value === undefined) continue;
    if (key === "duplicateKey" && value === null) {
      candidate.duplicateKey = null;
      continue;
    }
    if (typeof value !== "string") {
      issues.push(`${key} must be a string${key === "duplicateKey" ? " or null" : ""}`);
      continue;
    }
    candidate[key] = value.trim() as never;
  }

  for (const key of OPTIONAL_BOOLEANS) {
    const value = input[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      issues.push(`${key} must be a boolean`);
      continue;
    }
    candidate[key] = value;
  }

  for (const key of OPTIONAL_STRING_ARRAYS) {
    const value = input[key];
    if (value === undefined) continue;
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      issues.push(`${key} must be an array of strings`);
      continue;
    }
    candidate[key] = value.map((item) => item.trim()).filter(Boolean);
  }

  return issues.length
    ? { success: false, candidate, issues }
    : { success: true, candidate, issues: [] };
}

export function parseCreativeCandidates(input: unknown): CreativeCandidateParseResult[] {
  if (!Array.isArray(input)) {
    throw new Error("VIDEO_LAB_CANDIDATE_ARRAY_REQUIRED");
  }
  return input.map((candidate, index) =>
    parseCreativeCandidate(candidate, `INVALID_CANDIDATE_${String(index + 1).padStart(2, "0")}`)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
