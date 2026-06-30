import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { mapImagePackSources } from "../src/uploads/multi-channel/imagePackAutoMapper";
import { getImagePackInboxPaths, parseImagePackManifest } from "../src/uploads/multi-channel/imagePackManifest";
import { importV041ImagePack } from "../src/uploads/multi-channel/imagePackImporter";
import { inspectImageBuffer } from "../src/uploads/multi-channel/imagePackQualityGate";

async function makeCwd() {
  return mkdtemp(path.join(os.tmpdir(), "commerce-v042-"));
}

function validPng(width = 1080, height = 1920) {
  const buffer = Buffer.alloc(60001);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  for (let index = 32; index < buffer.length; index += 1) {
    buffer[index] = index % 251;
  }
  return buffer;
}

async function writeRawImages(cwd: string, names = defaultNames()) {
  const paths = getImagePackInboxPaths({ cwd });
  await mkdir(paths.raw_dir, { recursive: true });
  for (const name of names) {
    await writeFile(path.join(paths.raw_dir, name), validPng());
  }
}

async function writeStoredZipImages(cwd: string, names = defaultNames()) {
  const paths = getImagePackInboxPaths({ cwd });
  await mkdir(paths.inbox_root, { recursive: true });
  await writeFile(paths.zip_path, makeStoredZip(names.map((name) => ({ name, data: validPng() }))));
}

function defaultNames() {
  return [
    "car_01.png",
    "car_02.png",
    "car_03.png",
    "car_04.png",
    "car_05.png",
    "car_06.png",
    "laundry_01.png",
    "drying_02.png",
    "rack_03.png",
    "socks_04.png",
    "towel_05.png",
    "rain_06.png",
    "desk_01.png",
    "cable_02.png",
    "organizer_03.png",
    "clutter_04.png",
    "usb_05.png",
    "cable_06.png"
  ];
}

function makeStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

describe("v042 batch image pack importer", () => {
  test("image_pack_manifest_tests parse safe manifest items", () => {
    const manifest = parseImagePackManifest({
      version: "v041",
      items: [
        {
          source_file: "car_messy_01.png",
          channel_key: "father_jobs",
          scene_key: "01-car-messy-cup-holder"
        }
      ]
    });

    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0].channel_key).toBe("father_jobs");
    expect(() => parseImagePackManifest({
      version: "v041",
      items: [{ source_file: "../bad.png", channel_key: "father_jobs", scene_key: "scene_1" }]
    })).toThrow("IMAGE_PACK_SOURCE_FILE_NOT_SAFE_RELATIVE");
  });

  test("image_pack_auto_mapper_tests use manifest first and order fallback when needed", () => {
    const cwd = "C:\\repo";
    const mappings = mapImagePackSources({
      cwd,
      sources: [
        { source_file: "z.png", source_path: "C:\\repo\\raw\\z.png" },
        { source_file: "plain-01.png", source_path: "C:\\repo\\raw\\plain-01.png" }
      ],
      manifest: {
        version: "v041",
        items: [{ source_file: "z.png", channel_key: "lets_buy", scene_key: "01-messy-desk-cables" }]
      }
    });

    expect(mappings[0].mapping_confidence).toBe("ORDER_BASED_REQUIRES_OWNER_REVIEW");
    expect(mappings.some((mapping) => mapping.mapping_confidence === "MANIFEST_EXACT")).toBe(true);
  });

  test("image_pack_quality_gate_tests validate dimensions and reject tiny placeholders", () => {
    const good = inspectImageBuffer("good.png", validPng());
    const tiny = inspectImageBuffer("tiny.png", validPng(300, 300));

    expect(good.decode_success).toBe(true);
    expect(good.portrait).toBe(true);
    expect(good.file_size_pass).toBe(true);
    expect(good.placeholder_detected).toBe(false);
    expect(tiny.blockers).toContain("IMAGE_NOT_PORTRAIT");
    expect(tiny.blockers).toContain("IMAGE_WIDTH_TOO_SMALL");
  });

  test("image_pack_importer_tests import raw folder into v041 expected paths and write previews", async () => {
    const cwd = await makeCwd();
    try {
      await writeRawImages(cwd);
      const result = await importV041ImagePack({ cwd });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V042_IMAGE_PACK_IMPORTED_READY_FOR_REVIEW_V041");
      expect(result.required_image_count).toBe(18);
      expect(result.imported_image_count).toBe(18);
      expect(result.all_required_images_present).toBe(true);
      expect(result.all_images_decode_success).toBe(true);
      expect(result.all_images_portrait).toBe(true);
      expect(result.all_images_min_width).toBe(true);
      expect(result.all_images_min_height).toBe(true);
      expect(result.all_images_file_size_gt_50000).toBe(true);
      expect(result.mosaic_pattern_detected).toBe(false);
      expect(result.checkerboard_pattern_detected).toBe(false);
      expect(result.noise_texture_detected).toBe(false);
      expect(result.placeholder_detected).toBe(false);
      expect(result.youtube_execute_called).toBe(false);
      expect(result.videos_insert_called).toBe(false);
      await expect(stat(path.join(cwd, "commerce-assets/manual-drop/v041/father_jobs/01-car-messy-cup-holder.png"))).resolves.toBeTruthy();
      await expect(stat(result.artifacts.image_pack_import_report)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.image_pack_mapping_preview)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.imported_image_contact_sheet)).resolves.toBeTruthy();
      await expect(stat(result.artifacts.image_pack_quality_report)).resolves.toBeTruthy();
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("zip_mode_supported imports stored zip images", async () => {
    const cwd = await makeCwd();
    try {
      await writeStoredZipImages(cwd);
      const result = await importV041ImagePack({ cwd });

      expect(result.FINAL_STATUS).toBe("SUCCESS_V042_IMAGE_PACK_IMPORTED_READY_FOR_REVIEW_V041");
      expect(result.source_mode).toBe("zip");
      expect(result.imported_image_count).toBe(18);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("no_placeholder_image_import_tests block incomplete packs", async () => {
    const cwd = await makeCwd();
    try {
      await writeRawImages(cwd, ["car_01.png"]);
      const result = await importV041ImagePack({ cwd });

      expect(result.FINAL_STATUS).toBe("BLOCKED_V042_IMAGE_PACK_IMPORT");
      expect(result.validation_blockers).toContain("IMAGE_PACK_MAPPING_INCOMPLETE");
      expect(result.SAFE_TO_UPLOAD).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });

  test("v041_expected_paths_integration_tests and no_committed_commerce_assets_tests", async () => {
    const cwd = await makeCwd();
    try {
      await writeRawImages(cwd);
      const result = await importV041ImagePack({ cwd });
      const report = await readFile(result.artifacts.image_pack_import_report, "utf8");

      expect(report).toContain("commerce-assets");
      expect(report).not.toContain("https://");
      expect(report).not.toContain("example.com");
      expect(result.raw_urls_printed).toBe(false);
      expect(result.secrets_printed).toBe(false);
    } finally {
      await rm(cwd, { recursive: true, force: true });
    }
  });
});
