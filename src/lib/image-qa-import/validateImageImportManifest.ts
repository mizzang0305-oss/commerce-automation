import type {
  ImageImportAssetType,
  ImageImportManifestAsset,
  ImageImportManifestValidationResult,
  ImageQaStatus
} from "@/lib/image-qa-import/types";
import { imageQaImportSideEffects, imageQaStatuses, requiredImageImportAssetTypes } from "@/lib/image-qa-import/constants";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : "";
}

function isAssetType(value: unknown): value is ImageImportAssetType {
  return typeof value === "string" && requiredImageImportAssetTypes.includes(value as ImageImportAssetType);
}

function isQaStatus(value: unknown): value is ImageQaStatus {
  return typeof value === "string" && imageQaStatuses.includes(value as ImageQaStatus);
}

export function validateImageImportManifest(input: unknown): ImageImportManifestValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isRecord(input)) {
    return {
      ok: false,
      manifest: null,
      errors: ["manifest must be a JSON object."],
      warnings,
      side_effects: { ...imageQaImportSideEffects },
      approval_required: true
    };
  }

  const candidateId = asNonEmptyString(input.candidate_id);
  if (!candidateId) {
    errors.push("candidate_id is required.");
  }

  if (!Array.isArray(input.assets)) {
    errors.push("assets must be an array.");
  }

  const assets: ImageImportManifestAsset[] = [];
  const rawAssets = Array.isArray(input.assets) ? input.assets : [];

  rawAssets.forEach((rawAsset, index) => {
    if (!isRecord(rawAsset)) {
      errors.push(`assets[${index}] must be an object.`);
      return;
    }

    if (!isAssetType(rawAsset.asset_type)) {
      errors.push(
        `assets[${index}].asset_type must be one of ${requiredImageImportAssetTypes.join(", ")}.`
      );
    }
    const providedFilename = asNonEmptyString(rawAsset.provided_filename);
    const providedPath = asNonEmptyString(rawAsset.provided_path);
    if (!providedFilename) {
      errors.push(`assets[${index}].provided_filename is required.`);
    }
    if (!providedPath) {
      errors.push(`assets[${index}].provided_path is required.`);
    }
    if (!isQaStatus(rawAsset.qa_status)) {
      errors.push(`assets[${index}].qa_status must be one of ${imageQaStatuses.join(", ")}.`);
    }

    if (isAssetType(rawAsset.asset_type) && providedFilename && providedPath && isQaStatus(rawAsset.qa_status)) {
      assets.push({
        asset_type: rawAsset.asset_type,
        provided_filename: providedFilename,
        provided_path: providedPath,
        qa_status: rawAsset.qa_status
      });
    }
  });

  const presentTypes = new Set(assets.map((asset) => asset.asset_type));
  const missing = requiredImageImportAssetTypes.filter((assetType) => !presentTypes.has(assetType));
  if (missing.length > 0) {
    warnings.push(`Missing required asset types: ${missing.join(", ")}.`);
  }

  const duplicateTypes = assets
    .map((asset) => asset.asset_type)
    .filter((assetType, index, assetTypes) => assetTypes.indexOf(assetType) !== index);
  if (duplicateTypes.length > 0) {
    warnings.push(`Duplicate asset types need manual review: ${Array.from(new Set(duplicateTypes)).join(", ")}.`);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      manifest: null,
      errors,
      warnings,
      side_effects: { ...imageQaImportSideEffects },
      approval_required: true
    };
  }

  return {
    ok: true,
    manifest: {
      candidate_id: candidateId,
      assets
    },
    errors: [],
    warnings,
    side_effects: { ...imageQaImportSideEffects },
    approval_required: true
  };
}
