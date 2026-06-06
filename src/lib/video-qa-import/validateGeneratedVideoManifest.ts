import { generatedVideoQaImportPlanSideEffects, generatedVideoQaStatuses } from "@/lib/video-qa-import/constants";
import type {
  GeneratedVideoFormat,
  GeneratedVideoManifest,
  GeneratedVideoManifestAsset,
  GeneratedVideoManifestValidationResult,
  GeneratedVideoQaStatus,
  GeneratedVideoSource
} from "@/lib/video-qa-import/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function isQaStatus(value: unknown): value is GeneratedVideoQaStatus {
  return typeof value === "string" && generatedVideoQaStatuses.includes(value as GeneratedVideoQaStatus);
}

function isFormat(value: unknown): value is GeneratedVideoFormat {
  return value === "shorts_9_16" || value === "unknown";
}

function asSource(value: unknown, providedPath: string): GeneratedVideoSource {
  if (value === "local_path" || value === "google_drive_sync_path" || value === "manual_manifest") {
    return value;
  }
  return /google drive|g:\/|g:\\|my drive/i.test(providedPath) ? "google_drive_sync_path" : "manual_manifest";
}

function asDuration(value: unknown, errors: string[], index: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  errors.push(`videos[${index}].duration_sec must be null or a non-negative number.`);
  return null;
}

export function validateGeneratedVideoManifest(input: unknown): GeneratedVideoManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      manifest: null,
      errors: ["manifest must be a JSON object."],
      warnings,
      side_effects: { ...generatedVideoQaImportPlanSideEffects },
      approval_required: true
    };
  }

  const candidateId = asNonEmptyString(input.candidate_id);
  if (!candidateId) {
    errors.push("candidate_id is required.");
  }

  if (!Array.isArray(input.videos)) {
    errors.push("videos must be an array.");
  }

  const videos: GeneratedVideoManifestAsset[] = [];
  const rawVideos = Array.isArray(input.videos) ? input.videos : [];

  rawVideos.forEach((rawVideo, index) => {
    if (!isRecord(rawVideo)) {
      errors.push(`videos[${index}] must be an object.`);
      return;
    }

    const providedFilename = asNonEmptyString(rawVideo.provided_filename);
    const providedPath = asNonEmptyString(rawVideo.provided_path);
    if (!providedFilename) {
      errors.push(`videos[${index}].provided_filename is required.`);
    }
    if (!providedPath) {
      errors.push(`videos[${index}].provided_path is required.`);
    }
    if (!isQaStatus(rawVideo.qa_status)) {
      errors.push(`videos[${index}].qa_status must be one of ${generatedVideoQaStatuses.join(", ")}.`);
    }
    if (!isFormat(rawVideo.format)) {
      errors.push(`videos[${index}].format must be shorts_9_16 or unknown.`);
    }

    const durationSec = asDuration(rawVideo.duration_sec, errors, index);
    const qaNotes = Array.isArray(rawVideo.qa_notes)
      ? rawVideo.qa_notes.filter((note): note is string => typeof note === "string" && note.trim().length > 0)
      : [];

    if (providedFilename && providedPath && isQaStatus(rawVideo.qa_status) && isFormat(rawVideo.format)) {
      videos.push({
        provided_filename: providedFilename,
        provided_path: providedPath,
        source: asSource(rawVideo.source, providedPath),
        duration_sec: durationSec,
        format: rawVideo.format,
        qa_status: rawVideo.qa_status,
        qa_notes: qaNotes
      });
    }
  });

  if (videos.length === 0) {
    warnings.push("No valid generated video entries were provided.");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      manifest: null,
      errors,
      warnings,
      side_effects: { ...generatedVideoQaImportPlanSideEffects },
      approval_required: true
    };
  }

  return {
    ok: true,
    manifest: {
      candidate_id: candidateId,
      videos
    },
    errors: [],
    warnings,
    side_effects: { ...generatedVideoQaImportPlanSideEffects },
    approval_required: true
  };
}

export function parseGeneratedVideoManifest(manifestText: string): GeneratedVideoManifest {
  const parsed = JSON.parse(manifestText) as unknown;
  const validation = validateGeneratedVideoManifest(parsed);
  if (!validation.ok) {
    throw new Error(validation.errors.join(" "));
  }
  return validation.manifest;
}
