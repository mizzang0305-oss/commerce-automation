import type { RenderPlan, RenderPlanShot } from "@/lib/video/renderPlanTypes";

export type RenderPlanOverrideErrorCode =
  | "INVALID_RENDER_PLAN_OVERRIDE"
  | "UNKNOWN_RENDER_PLAN_SHOT"
  | "INVALID_RENDER_PLAN_DURATION"
  | "UNSAFE_RENDER_PLAN_OVERRIDE";

export type RenderPlanShotOverride = {
  shot_id: string;
  title?: string;
  caption?: string;
  voice_text?: string;
  duration_seconds?: number;
  order_index?: number;
} & Record<string, unknown>;

export type RenderPlanOverride = {
  shots: RenderPlanShotOverride[];
  updated_by?: string;
} & Record<string, unknown>;

export type RenderPlanOverrideValidationResult =
  | {
      ok: true;
      warnings: string[];
    }
  | {
      ok: false;
      error_code: RenderPlanOverrideErrorCode;
      message: string;
      safe_error: string;
      warnings: string[];
    };

const TITLE_MAX_LENGTH = 60;
const CAPTION_MAX_LENGTH = 80;
const VOICE_TEXT_MAX_LENGTH = 160;
const MIN_SHOT_DURATION_SECONDS = 2;
const MAX_SHOT_DURATION_SECONDS = 8;
const MIN_TOTAL_DURATION_SECONDS = 6;
const MAX_TOTAL_DURATION_SECONDS = 30;

const ALLOWED_SHOT_KEYS = new Set([
  "shot_id",
  "title",
  "caption",
  "voice_text",
  "duration_seconds",
  "order_index"
]);

const FORBIDDEN_TOP_LEVEL_KEYS = new Set([
  "selected_affiliate_url",
  "disclosure_text",
  "external_url",
  "upload_enabled",
  "manual_upload_only",
  "worker_command",
  "worker_job",
  "worker_jobs"
]);

const UNSAFE_CLAIM_PATTERNS = [
  /guaranteed/i,
  /best price/i,
  /lowest price/i,
  /\b100%\b/i,
  /cures?/i,
  /treats?/i,
  /보장/,
  /최저가/,
  /무조건/,
  /100%/,
  /완치/,
  /치료/,
  /효능\s*보장/
];

const SECRET_KEY_PATTERNS = [
  /secret/i,
  /api[_-]?key/i,
  /authorization/i,
  /token/i,
  /password/i
];

export function sanitizeRenderPlanOverrideInput(input: unknown): RenderPlanOverride {
  const value = isRecord(input) ? input : {};
  const shots = Array.isArray(value.shots) ? value.shots : [];
  return {
    shots: shots.filter(isRecord).map((shot) => {
      const sanitized: RenderPlanShotOverride = {
        shot_id: stringValue(shot.shot_id)
      };
      for (const [key, rawValue] of Object.entries(shot)) {
        if (SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
          continue;
        }
        if (key === "title" || key === "caption" || key === "voice_text") {
          sanitized[key] = stringValue(rawValue);
        } else if (key === "duration_seconds") {
          sanitized.duration_seconds = numberValue(rawValue);
        } else if (key === "order_index") {
          sanitized.order_index = numberValue(rawValue);
        } else if (key !== "shot_id") {
          sanitized[key] = rawValue;
        }
      }
      return sanitized;
    }),
    updated_by: stringValue(value.updated_by)
  };
}

export function validateRenderPlanOverride(
  override: RenderPlanOverride | null | undefined,
  baseRenderPlan: RenderPlan
): RenderPlanOverrideValidationResult {
  if (!override || !Array.isArray(override.shots) || override.shots.length === 0) {
    return invalid("INVALID_RENDER_PLAN_OVERRIDE", "Render plan override must include at least one shot.");
  }

  for (const key of Object.keys(override)) {
    if (FORBIDDEN_TOP_LEVEL_KEYS.has(key) || SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      return invalid("INVALID_RENDER_PLAN_OVERRIDE", "Render plan override includes a forbidden field.");
    }
  }

  const baseShotIds = new Set(baseRenderPlan.shots.map((shot) => shot.shot_id));
  const overriddenDurations = new Map<string, number>();

  for (const shot of override.shots) {
    if (!shot.shot_id || !baseShotIds.has(shot.shot_id)) {
      return invalid("UNKNOWN_RENDER_PLAN_SHOT", "Render plan override references an unknown shot.");
    }

    for (const key of Object.keys(shot)) {
      if (!ALLOWED_SHOT_KEYS.has(key) || SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        return invalid("INVALID_RENDER_PLAN_OVERRIDE", "Render plan shot override includes a forbidden field.");
      }
    }

    if (shot.title !== undefined && shot.title.trim().length > TITLE_MAX_LENGTH) {
      return invalid("INVALID_RENDER_PLAN_OVERRIDE", `Shot title must be ${TITLE_MAX_LENGTH} characters or less.`);
    }
    if (shot.caption !== undefined && shot.caption.trim().length > CAPTION_MAX_LENGTH) {
      return invalid("INVALID_RENDER_PLAN_OVERRIDE", `Shot caption must be ${CAPTION_MAX_LENGTH} characters or less.`);
    }
    if (shot.voice_text !== undefined && shot.voice_text.trim().length > VOICE_TEXT_MAX_LENGTH) {
      return invalid("INVALID_RENDER_PLAN_OVERRIDE", `Shot voice text must be ${VOICE_TEXT_MAX_LENGTH} characters or less.`);
    }

    const unsafeText = [shot.title, shot.caption, shot.voice_text].filter(Boolean).join(" ");
    if (UNSAFE_CLAIM_PATTERNS.some((pattern) => pattern.test(unsafeText))) {
      return invalid("UNSAFE_RENDER_PLAN_OVERRIDE", "Render plan override contains unsafe claim language.");
    }

    if (shot.duration_seconds !== undefined) {
      if (
        !Number.isFinite(shot.duration_seconds) ||
        shot.duration_seconds < MIN_SHOT_DURATION_SECONDS ||
        shot.duration_seconds > MAX_SHOT_DURATION_SECONDS
      ) {
        return invalid("INVALID_RENDER_PLAN_DURATION", "Render plan shot duration is outside the allowed range.");
      }
      overriddenDurations.set(shot.shot_id, shot.duration_seconds);
    }
  }

  const totalDuration = baseRenderPlan.shots.reduce(
    (sum, shot) => sum + (overriddenDurations.get(shot.shot_id) ?? shot.duration_sec),
    0
  );
  if (totalDuration < MIN_TOTAL_DURATION_SECONDS || totalDuration > MAX_TOTAL_DURATION_SECONDS) {
    return invalid("INVALID_RENDER_PLAN_DURATION", "Render plan total duration is outside the allowed range.");
  }

  return { ok: true, warnings: [] };
}

export function applyRenderPlanOverride(baseRenderPlan: RenderPlan, override: RenderPlanOverride): RenderPlan {
  const overridesByShotId = new Map(override.shots.map((shot) => [shot.shot_id, shot]));
  return {
    ...clone(baseRenderPlan),
    shots: baseRenderPlan.shots.map((shot) => applyShotOverride(shot, overridesByShotId.get(shot.shot_id)))
  };
}

export function getEffectiveRenderPlan(
  baseRenderPlan: RenderPlan,
  override: RenderPlanOverride | null | undefined
): { ok: true; render_plan: RenderPlan } | (RenderPlanOverrideValidationResult & { ok: false }) {
  if (!override) {
    return { ok: true, render_plan: clone(baseRenderPlan) };
  }
  const validation = validateRenderPlanOverride(override, baseRenderPlan);
  if (!validation.ok) {
    return validation;
  }
  return { ok: true, render_plan: applyRenderPlanOverride(baseRenderPlan, override) };
}

export function summarizeRenderPlanOverride(override: RenderPlanOverride | null | undefined) {
  return {
    present: Boolean(override?.shots?.length),
    shot_count: override?.shots?.length ?? 0,
    updated_by: override?.updated_by ?? ""
  };
}

function applyShotOverride(baseShot: RenderPlanShot, override: RenderPlanShotOverride | undefined): RenderPlanShot {
  if (!override) {
    return clone(baseShot);
  }
  return {
    ...clone(baseShot),
    caption: override.caption?.trim() || override.title?.trim() || baseShot.caption,
    voice_text: override.voice_text?.trim() || baseShot.voice_text,
    duration_sec: override.duration_seconds ?? baseShot.duration_sec
  };
}

function invalid(errorCode: RenderPlanOverrideErrorCode, message: string): RenderPlanOverrideValidationResult {
  return {
    ok: false,
    error_code: errorCode,
    message,
    safe_error: message,
    warnings: []
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
