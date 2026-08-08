import type { RankedCreative } from "../../video-lab/types";
import type { HookFamily } from "./types";

export function classifyHookFamily(hook: string): HookFamily {
  const normalized = hook.trim();
  if (/전후|비포|애프터/u.test(normalized)) return "BEFORE_AFTER";
  if (/손해|놓치|낭비/u.test(normalized)) return "LOSS";
  if (/\d+가지|확인|체크/u.test(normalized)) return "CHECKLIST";
  if (/공간|좁은/u.test(normalized)) return "SPACE";
  if (/왜|\?$/u.test(normalized)) return "QUESTION";
  if (/문제|불편/u.test(normalized)) return "PROBLEM";
  return "CURIOSITY";
}

export function detectRepeatedHookFamilies(hooks: readonly string[]): string[] {
  const counts = new Map<HookFamily, number>();
  for (const hook of hooks) {
    const family = classifyHookFamily(hook);
    counts.set(family, (counts.get(family) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, count]) => count > 1).map(([family]) => family);
}

export function selectDistinctHookCandidate(
  ranked: readonly RankedCreative[],
  usedFamilies: ReadonlySet<HookFamily>,
  preferredFamily?: HookFamily
): RankedCreative | null {
  const passing = ranked.filter((entry) => entry.score.passed);
  const preferred = preferredFamily
    ? passing.find((entry) => classifyHookFamily(entry.candidate.hook) === preferredFamily && !usedFamilies.has(preferredFamily))
    : undefined;
  return preferred ?? passing.find((entry) => !usedFamilies.has(classifyHookFamily(entry.candidate.hook))) ?? null;
}
