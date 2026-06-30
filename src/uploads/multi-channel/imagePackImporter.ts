import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

import { mapImagePackSources, type ImagePackMapping } from "./imagePackAutoMapper";
import {
  getImagePackInboxPaths,
  isSupportedImagePackFile,
  readImagePackManifest
} from "./imagePackManifest";
import { validateImagePackFile, type ImagePackQualityProbe } from "./imagePackQualityGate";

const inflateRaw = promisify(zlib.inflateRaw);

export type ImagePackImportResult = {
  FINAL_STATUS: "SUCCESS_V042_IMAGE_PACK_IMPORTED_READY_FOR_REVIEW_V041" | "BLOCKED_V042_IMAGE_PACK_IMPORT";
  V042_IMPORTER_READY: boolean;
  SAFE_TO_UPLOAD: false;
  required_image_count: number;
  imported_image_count: number;
  all_required_images_present: boolean;
  all_images_decode_success: boolean;
  all_images_portrait: boolean;
  all_images_min_width: boolean;
  all_images_min_height: boolean;
  all_images_file_size_gt_50000: boolean;
  mosaic_pattern_detected: boolean;
  checkerboard_pattern_detected: boolean;
  noise_texture_detected: boolean;
  placeholder_detected: boolean;
  mapping_confidence: string[];
  validation_blocker: string | null;
  validation_blockers: string[];
  source_mode: "manifest" | "zip" | "raw_folder" | "none";
  artifacts: {
    image_pack_import_report: string;
    image_pack_mapping_preview: string;
    imported_image_contact_sheet: string;
    image_pack_quality_report: string;
  };
  youtube_execute_called: false;
  videos_insert_called: false;
  new_upload_attempted: false;
  comment_create_update_delete_called: false;
  visibility_changed: false;
  R2_upload: false;
  product_assets_write: false;
  DB_write: false;
  raw_urls_printed: false;
  secrets_printed: false;
  fake_success: false;
};

export async function importV041ImagePack(input: { cwd?: string } = {}): Promise<ImagePackImportResult> {
  const cwd = input.cwd ?? process.cwd();
  const outputRoot = path.join(cwd, "commerce-assets", "review", "v042");
  await fs.mkdir(outputRoot, { recursive: true });

  const sources = await collectImagePackSources({ cwd });
  const manifest = await readImagePackManifest({ cwd });
  const mappings = mapImagePackSources({ cwd, sources: sources.sources, manifest });
  const enrichedMappings: ImagePackMapping[] = [];
  const qualityReports: Array<ImagePackMapping & { quality: ImagePackQualityProbe }> = [];
  const blockers: string[] = [];

  if (!sources.sources.length) blockers.push("IMAGE_PACK_SOURCE_IMAGES_MISSING");
  if (mappings.length < 18) blockers.push("IMAGE_PACK_MAPPING_INCOMPLETE");

  for (const mapping of mappings.slice(0, 18)) {
    await fs.mkdir(path.dirname(mapping.target_path), { recursive: true });
    await fs.copyFile(mapping.source_path, mapping.target_path);
    const quality = await validateImagePackFile(mapping.target_path);
    const validationStatus = quality.blockers.length ? "FAIL" : "PASS";
    const mapped: ImagePackMapping = {
      ...mapping,
      validation_status: validationStatus,
      blockers: quality.blockers
    };
    enrichedMappings.push(mapped);
    qualityReports.push({ ...mapped, quality });
    blockers.push(...quality.blockers);
  }

  const importedImageCount = enrichedMappings.filter((mapping) => mapping.validation_status === "PASS").length;
  const allRequiredImagesPresent = enrichedMappings.length === 18;
  const allImagesDecodeSuccess = allRequiredImagesPresent && qualityReports.every((item) => item.quality.decode_success);
  const allImagesPortrait = allRequiredImagesPresent && qualityReports.every((item) => item.quality.portrait);
  const allImagesMinWidth = allRequiredImagesPresent && qualityReports.every((item) => item.quality.min_width_pass);
  const allImagesMinHeight = allRequiredImagesPresent && qualityReports.every((item) => item.quality.min_height_pass);
  const allImagesFileSize = allRequiredImagesPresent && qualityReports.every((item) => item.quality.file_size_pass);
  const mosaicDetected = qualityReports.some((item) => item.quality.mosaic_pattern_detected);
  const checkerboardDetected = qualityReports.some((item) => item.quality.checkerboard_pattern_detected);
  const noiseDetected = qualityReports.some((item) => item.quality.noise_texture_detected);
  const placeholderDetected = qualityReports.some((item) => item.quality.placeholder_detected);

  if (!allRequiredImagesPresent) blockers.push("REQUIRED_IMAGE_COUNT_NOT_IMPORTED");
  if (!allImagesDecodeSuccess) blockers.push("IMAGE_PACK_DECODE_FAILED");
  if (!allImagesPortrait) blockers.push("IMAGE_PACK_NOT_PORTRAIT");
  if (!allImagesMinWidth) blockers.push("IMAGE_PACK_WIDTH_TOO_SMALL");
  if (!allImagesMinHeight) blockers.push("IMAGE_PACK_HEIGHT_TOO_SMALL");
  if (!allImagesFileSize) blockers.push("IMAGE_PACK_FILE_TOO_SMALL");
  if (mosaicDetected) blockers.push("MOSAIC_PATTERN_DETECTED");
  if (checkerboardDetected) blockers.push("CHECKERBOARD_PATTERN_DETECTED");
  if (noiseDetected) blockers.push("NOISE_TEXTURE_DETECTED");
  if (placeholderDetected) blockers.push("PLACEHOLDER_DETECTED");

  const uniqueBlockers = [...new Set(blockers)];
  const artifacts = {
    image_pack_import_report: path.join(outputRoot, "image-pack-import-report.json"),
    image_pack_mapping_preview: path.join(outputRoot, "image-pack-mapping-preview.html"),
    imported_image_contact_sheet: path.join(outputRoot, "imported-image-contact-sheet.jpg"),
    image_pack_quality_report: path.join(outputRoot, "image-pack-quality-report.json")
  };

  const result: ImagePackImportResult = {
    FINAL_STATUS: uniqueBlockers.length === 0
      ? "SUCCESS_V042_IMAGE_PACK_IMPORTED_READY_FOR_REVIEW_V041"
      : "BLOCKED_V042_IMAGE_PACK_IMPORT",
    V042_IMPORTER_READY: true,
    SAFE_TO_UPLOAD: false,
    required_image_count: 18,
    imported_image_count: importedImageCount,
    all_required_images_present: allRequiredImagesPresent,
    all_images_decode_success: allImagesDecodeSuccess,
    all_images_portrait: allImagesPortrait,
    all_images_min_width: allImagesMinWidth,
    all_images_min_height: allImagesMinHeight,
    all_images_file_size_gt_50000: allImagesFileSize,
    mosaic_pattern_detected: mosaicDetected,
    checkerboard_pattern_detected: checkerboardDetected,
    noise_texture_detected: noiseDetected,
    placeholder_detected: placeholderDetected,
    mapping_confidence: [...new Set(enrichedMappings.map((mapping) => mapping.mapping_confidence))],
    validation_blocker: uniqueBlockers[0] ?? null,
    validation_blockers: uniqueBlockers,
    source_mode: manifest ? "manifest" : sources.source_mode,
    artifacts,
    youtube_execute_called: false,
    videos_insert_called: false,
    new_upload_attempted: false,
    comment_create_update_delete_called: false,
    visibility_changed: false,
    R2_upload: false,
    product_assets_write: false,
    DB_write: false,
    raw_urls_printed: false,
    secrets_printed: false,
    fake_success: false
  };

  await writeJson(artifacts.image_pack_import_report, {
    ...result,
    mappings: enrichedMappings
  });
  await writeJson(artifacts.image_pack_quality_report, {
    version: "v042",
    required_image_count: 18,
    imported_image_count: importedImageCount,
    validation_blockers: uniqueBlockers,
    images: qualityReports
  });
  await fs.writeFile(artifacts.image_pack_mapping_preview, buildMappingPreview(enrichedMappings), "utf8");
  await fs.writeFile(artifacts.imported_image_contact_sheet, buildContactSheetPlaceholder(enrichedMappings), "utf8");

  return result;
}

async function collectImagePackSources(input: { cwd: string }) {
  const paths = getImagePackInboxPaths({ cwd: input.cwd });
  try {
    await fs.access(paths.zip_path);
    const extractedDir = path.join(paths.inbox_root, ".extracted");
    await fs.rm(extractedDir, { recursive: true, force: true });
    await fs.mkdir(extractedDir, { recursive: true });
    const entries = await extractZipImages(paths.zip_path, extractedDir);
    return { source_mode: "zip" as const, sources: entries };
  } catch {
    const rawSources = await collectRawFolderSources(paths.raw_dir);
    return { source_mode: rawSources.length ? "raw_folder" as const : "none" as const, sources: rawSources };
  }
}

async function collectRawFolderSources(rawDir: string) {
  try {
    const entries = await fs.readdir(rawDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && isSupportedImagePackFile(entry.name))
      .map((entry) => ({
        source_file: entry.name,
        source_path: path.join(rawDir, entry.name)
      }))
      .sort((a, b) => a.source_file.localeCompare(b.source_file, undefined, { numeric: true, sensitivity: "base" }));
  } catch {
    return [];
  }
}

async function extractZipImages(zipPath: string, outputDir: string) {
  const zip = await fs.readFile(zipPath);
  const entries: Array<{ source_file: string; source_path: string }> = [];
  const centralDirectoryOffset = findEndOfCentralDirectory(zip);
  let offset = centralDirectoryOffset.directoryOffset;
  for (let index = 0; index < centralDirectoryOffset.entryCount; index += 1) {
    if (zip.readUInt32LE(offset) !== 0x02014b50) break;
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const fileNameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const fileName = zip.toString("utf8", offset + 46, offset + 46 + fileNameLength).replace(/\\/g, "/");
    offset += 46 + fileNameLength + extraLength + commentLength;
    if (fileName.endsWith("/") || fileName.includes("..") || !isSupportedImagePackFile(fileName)) continue;
    if (zip.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
    const localNameLength = zip.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zip.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = zip.subarray(dataStart, dataStart + compressedSize);
    const data = method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : null;
    if (!data) continue;
    const safeName = path.basename(fileName);
    const sourcePath = path.join(outputDir, safeName);
    await fs.writeFile(sourcePath, data);
    entries.push({ source_file: safeName, source_path: sourcePath });
  }
  return entries.sort((a, b) => a.source_file.localeCompare(b.source_file, undefined, { numeric: true, sensitivity: "base" }));
}

function findEndOfCentralDirectory(zip: Buffer) {
  for (let offset = zip.length - 22; offset >= 0; offset -= 1) {
    if (zip.readUInt32LE(offset) === 0x06054b50) {
      return {
        entryCount: zip.readUInt16LE(offset + 10),
        directoryOffset: zip.readUInt32LE(offset + 16)
      };
    }
  }
  throw new Error("ZIP_END_OF_CENTRAL_DIRECTORY_NOT_FOUND");
}

function buildMappingPreview(mappings: ImagePackMapping[]) {
  const rows = mappings.map((mapping) => [
    "<tr>",
    `<td>${escapeHtml(mapping.source_file)}</td>`,
    `<td>${escapeHtml(mapping.channel_key)}</td>`,
    `<td>${escapeHtml(mapping.scene_key)}</td>`,
    `<td>${escapeHtml(mapping.target_path)}</td>`,
    `<td><img src="${escapeHtml(path.relative(path.dirname(path.join(process.cwd(), "commerce-assets", "review", "v042", "image-pack-mapping-preview.html")), mapping.target_path).replace(/\\/g, "/"))}" width="90" /></td>`,
    `<td>${escapeHtml(mapping.mapping_confidence)}</td>`,
    `<td>${escapeHtml(mapping.validation_status)}</td>`,
    "</tr>"
  ].join(""));
  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\" /><title>v042 Image Pack Mapping Preview</title>",
    "<style>body{font-family:Arial,sans-serif}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}img{max-height:160px}</style>",
    "</head><body>",
    "<h1>v042 Image Pack Mapping Preview</h1>",
    "<table><thead><tr><th>source file</th><th>target channel</th><th>target scene</th><th>target path</th><th>thumbnail</th><th>mapping confidence</th><th>validation status</th></tr></thead><tbody>",
    ...rows,
    "</tbody></table></body></html>"
  ].join("\n");
}

function buildContactSheetPlaceholder(mappings: ImagePackMapping[]) {
  return [
    "v042 imported image contact sheet",
    ...mappings.map((mapping) => `${mapping.channel_key} ${mapping.scene_key} ${mapping.source_file} ${mapping.validation_status}`)
  ].join("\n");
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
