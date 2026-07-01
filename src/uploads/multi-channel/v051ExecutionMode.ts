export type V051ExecutionMode =
  | "check_only"
  | "dry_run"
  | "mutation_enabled";

export const DEFAULT_V051_EXECUTION_MODE: V051ExecutionMode = "check_only";

export function resolveV051ExecutionMode(value?: string | null): V051ExecutionMode {
  if (value === "dry_run" || value === "mutation_enabled" || value === "check_only") {
    return value;
  }
  return DEFAULT_V051_EXECUTION_MODE;
}
