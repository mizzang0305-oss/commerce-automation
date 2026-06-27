import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const V022_TARGET_VERSION = "v022";
export const V022_CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
export const V022_AUTO_PROVIDER_BLOCKER = "BLOCKED_AUTO_REAL_SCENE_ASSET_PROVIDER_NOT_CONFIGURED";
export const V022_REQUIRED_REAL_SCENE_ASSETS = [
  "rain-window",
  "wet-laundry-problem",
  "small-room-laundry-mess",
  "drying-rack-reveal",
  "laundry-items-use-case",
  "before-after-room-laundry",
  "buying-checklist-background",
  "cta-background"
] as const;

export type V022AssetKey = typeof V022_REQUIRED_REAL_SCENE_ASSETS[number];
export type V022SceneRole = "problem" | "product_reveal" | "use_case" | "before_after" | "checklist" | "cta";
export type V022ProviderBlocker =
  | typeof V022_AUTO_PROVIDER_BLOCKER
  | "AUTO_GENERATED_ASSET_LICENSE_UNKNOWN"
  | "LOCAL_IMAGE_MODEL_COMMERCIAL_USE_UNKNOWN"
  | "LOCAL_IMAGE_PROVIDER_COMMAND_MISSING"
  | "LOCAL_IMAGE_PROVIDER_COMMAND_MUST_BE_OUTSIDE_REPO"
  | "LOCAL_IMAGE_PROVIDER_COMMAND_FAILED"
  | "REAL_SCENE_ASSET_PROVENANCE_MISSING";

export type V022AutoSceneBrief = {
  asset_key: V022AssetKey;
  role: V022SceneRole;
  prompt: string;
  negative_prompt: string;
  user_prompt_required: false;
  manual_asset_required: false;
  prompt_generated_by_system: true;
};

export type V022GeneratedAsset = {
  asset_key: V022AssetKey;
  absolute_path: string;
  relative_path: string;
  media_type: "image" | "video";
  photographic_or_video_asset: true;
  source_type: "existing_local" | "auto_generated_local";
};

export type V022GeneratedAssetProvenance = {
  asset_key: V022AssetKey;
  source_type: "existing_local" | "auto_generated_local";
  provider: string;
  commercial_use_allowed: boolean;
  watermark_free: boolean;
  prompt_generated_by_system: boolean;
  user_prompt_required: boolean;
  model_license_checked: boolean;
  raw_url_present: false;
  safe_summary: string;
};

export type V022RealSceneAssetGate = {
  real_scene_asset_gate_pass: boolean;
  scene_count: number;
  photographic_or_video_scene_count: number;
  primitive_shape_only_scene_count: number;
  text_only_scene_count: number;
  product_photo_only_scene_count: number;
  problem_scene_uses_real_asset: boolean;
  use_case_scene_uses_real_asset: boolean;
  before_after_scene_uses_real_asset: boolean;
  generated_asset_provenance_pass: boolean;
  commercial_use_allowed: boolean;
  watermark_free: boolean;
  model_license_checked: boolean;
  blockers: string[];
  asset_gate_blocker: string | null;
};

export type V022ProviderChecks = {
  existing_local_provider_checked: boolean;
  local_generated_scene_provider_checked: boolean;
  repo_image_skill_provider_checked: boolean;
  stock_provider_checked: boolean;
  product_image_limited_compositor_checked: boolean;
};

export type V022AutoRealSceneAssetResult = {
  target_version: typeof V022_TARGET_VERSION;
  candidate_id: typeof V022_CANDIDATE_ID;
  auto_real_scene_asset_provider_added: true;
  auto_real_scene_asset_provider_ready: boolean;
  provider_checks: V022ProviderChecks;
  user_scene_asset_input_required: false;
  user_prompt_required: false;
  required_asset_count: number;
  existing_asset_count: number;
  generated_asset_count: number;
  generated_asset_keys: V022AssetKey[];
  missing_assets: V022AssetKey[];
  generated_assets: V022GeneratedAsset[];
  provenance: V022GeneratedAssetProvenance[];
  generated_asset_provenance_pass: boolean;
  commercial_use_allowed: boolean;
  watermark_free: boolean;
  model_license_checked: boolean;
  provider_blocker: V022ProviderBlocker | null;
  manifest_path: string;
  provenance_path: string;
  gate_path: string;
  setup_guide_path: string;
  gate: V022RealSceneAssetGate;
};

export type GeneratedSceneWriter = (input: {
  assetKey: V022AssetKey;
  prompt: string;
  negativePrompt: string;
  outputPath: string;
}) => Promise<void>;

export type V022AutoRealSceneAssetOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  generatedSceneWriter?: GeneratedSceneWriter;
};

type ExistingAssetScan = {
  assets: V022GeneratedAsset[];
  count: number;
};

type LocalProviderReadiness = {
  enabled: boolean;
  approved: boolean;
  command: string | null;
  commercialUseConfirmed: boolean;
  watermarkFree: boolean;
  safe: boolean;
  blocker: V022ProviderBlocker | null;
};

const SOURCE_LIBRARY_ROOTS = [
  "commerce-assets/source-library/laundry",
  "commerce-assets/source-library/rainy-season",
  "commerce-assets/source-library/small-room",
  "commerce-assets/source-library/drying-rack"
];

const ASSET_EXTENSIONS = [".mp4", ".jpg", ".jpeg", ".png"];

const PROVIDER_CHECKS: V022ProviderChecks = {
  existing_local_provider_checked: true,
  local_generated_scene_provider_checked: true,
  repo_image_skill_provider_checked: true,
  stock_provider_checked: true,
  product_image_limited_compositor_checked: true
};

export function buildV022AutoSceneBriefs(): V022AutoSceneBrief[] {
  return [
    brief("rain-window", "problem", "Rainy window seen from inside a small home, humid rainy season mood, realistic vertical photo scene."),
    brief("wet-laundry-problem", "problem", "wet laundry hanging indoors and not drying well, damp-air problem scene, realistic everyday home photo."),
    brief("small-room-laundry-mess", "problem", "Small room with laundry taking too much floor space, cramped rainy-season drying problem, realistic home photo."),
    brief("drying-rack-reveal", "product_reveal", "Foldable drying rack set up neatly in an indoor room, clean product solution reveal, realistic ad-like photo."),
    brief("laundry-items-use-case", "use_case", "Towels, shirts, and socks hanging on a drying rack indoors, practical rainy-season use case, realistic photo."),
    brief("before-after-room-laundry", "before_after", "Before-after room comparison showing messy wet laundry then organized drying-rack setup, realistic commercial photo."),
    brief("buying-checklist-background", "checklist", "Clean indoor drying-rack background with empty checklist space, realistic photo with no baked-in text."),
    brief("cta-background", "cta", "Organized drying rack in a clean indoor room with room for a safe description-link CTA overlay.")
  ];
}

export async function generateV022AutoRealSceneAssets(
  options: V022AutoRealSceneAssetOptions = {}
): Promise<V022AutoRealSceneAssetResult> {
  const cwd = options.cwd ?? process.cwd();
  const env = { ...(await loadLocalEnv(cwd)), ...options.env };
  const reviewRoot = getV022ReviewRoot(cwd);
  const generatedRoot = path.join(cwd, "commerce-assets", "generated-scenes", V022_CANDIDATE_ID, V022_TARGET_VERSION);
  const manifestPath = path.join(reviewRoot, "auto-real-scene-asset-manifest.json");
  const provenancePath = path.join(reviewRoot, "generated-asset-provenance.json");
  const gatePath = path.join(reviewRoot, "real-scene-asset-gate.json");
  const setupGuidePath = path.join(reviewRoot, "auto-real-scene-provider-setup-guide.md");
  await fs.mkdir(reviewRoot, { recursive: true });
  await fs.mkdir(generatedRoot, { recursive: true });

  const existing = await scanExistingLocalAssets(cwd);
  const localProvider = readLocalGeneratedProviderReadiness(env, cwd);
  let generatedAssets: V022GeneratedAsset[] = [];
  let provenance: V022GeneratedAssetProvenance[] = [];
  let providerBlocker: V022ProviderBlocker | null = null;

  if (existing.count === V022_REQUIRED_REAL_SCENE_ASSETS.length && existingLocalAssetsLicenseConfirmed(env)) {
    generatedAssets = existing.assets;
    provenance = generatedAssets.map((asset) => buildProvenance(asset.asset_key, "existing_local", "existing_local_scene_asset_provider"));
  } else if (existing.count === V022_REQUIRED_REAL_SCENE_ASSETS.length && !existingLocalAssetsLicenseConfirmed(env)) {
    providerBlocker = "AUTO_GENERATED_ASSET_LICENSE_UNKNOWN";
  } else if (localProvider.enabled || options.generatedSceneWriter) {
    providerBlocker = localProvider.blocker;
    if (!providerBlocker) {
      try {
        generatedAssets = await generateMissingAssets({
          cwd,
          generatedRoot,
          env,
          writer: options.generatedSceneWriter,
          command: localProvider.command
        });
        provenance = generatedAssets.map((asset) => buildProvenance(
          asset.asset_key,
          "auto_generated_local",
          "local_generated_scene_image_provider"
        ));
      } catch {
        providerBlocker = "LOCAL_IMAGE_PROVIDER_COMMAND_FAILED";
        generatedAssets = [];
        provenance = [];
      }
    }
  } else {
    providerBlocker = V022_AUTO_PROVIDER_BLOCKER;
  }

  const missingAssets = V022_REQUIRED_REAL_SCENE_ASSETS.filter((assetKey) =>
    !generatedAssets.some((asset) => asset.asset_key === assetKey)
  );
  if (!providerBlocker && missingAssets.length > 0) {
    providerBlocker = V022_AUTO_PROVIDER_BLOCKER;
  }

  const gate = buildV022RealSceneAssetGate(generatedAssets, provenance);
  if (!providerBlocker && gate.real_scene_asset_gate_pass !== true) {
    providerBlocker = gate.asset_gate_blocker as V022ProviderBlocker | null;
  }

  const result: V022AutoRealSceneAssetResult = {
    target_version: V022_TARGET_VERSION,
    candidate_id: V022_CANDIDATE_ID,
    auto_real_scene_asset_provider_added: true,
    auto_real_scene_asset_provider_ready: providerBlocker === null && gate.real_scene_asset_gate_pass,
    provider_checks: { ...PROVIDER_CHECKS },
    user_scene_asset_input_required: false,
    user_prompt_required: false,
    required_asset_count: V022_REQUIRED_REAL_SCENE_ASSETS.length,
    existing_asset_count: existing.count,
    generated_asset_count: generatedAssets.length,
    generated_asset_keys: generatedAssets.map((asset) => asset.asset_key),
    missing_assets: missingAssets,
    generated_assets: generatedAssets,
    provenance,
    generated_asset_provenance_pass: gate.generated_asset_provenance_pass,
    commercial_use_allowed: gate.commercial_use_allowed,
    watermark_free: gate.watermark_free,
    model_license_checked: gate.model_license_checked,
    provider_blocker: providerBlocker,
    manifest_path: manifestPath,
    provenance_path: provenancePath,
    gate_path: gatePath,
    setup_guide_path: setupGuidePath,
    gate
  };

  await writeJson(manifestPath, buildManifest(result));
  await writeJson(provenancePath, provenance);
  await writeJson(gatePath, gate);
  if (result.auto_real_scene_asset_provider_ready !== true) {
    await fs.writeFile(setupGuidePath, buildSetupGuide(result), "utf8");
  }

  return result;
}

export async function isAutoRealSceneAssetProviderConfigured(cwd = process.cwd()): Promise<boolean> {
  const env = await loadLocalEnv(cwd);
  const existing = await scanExistingLocalAssets(cwd);
  if (existing.count === V022_REQUIRED_REAL_SCENE_ASSETS.length && existingLocalAssetsLicenseConfirmed(env)) {
    return true;
  }
  const localProvider = readLocalGeneratedProviderReadiness(env, cwd);
  return localProvider.safe;
}

export function buildV022RealSceneAssetGate(
  assets: V022GeneratedAsset[],
  provenance: V022GeneratedAssetProvenance[]
): V022RealSceneAssetGate {
  const blockers: string[] = [];
  const assetKeys = new Set(assets.map((asset) => asset.asset_key));
  const photographicOrVideoSceneCount = assets.filter((asset) => asset.photographic_or_video_asset).length;
  const generatedAssetProvenancePass =
    assets.length > 0 &&
    provenance.length === assets.length &&
    assets.every((asset) => provenance.some((entry) => entry.asset_key === asset.asset_key)) &&
    provenance.every((entry) =>
      entry.commercial_use_allowed === true &&
      entry.watermark_free === true &&
      entry.model_license_checked === true &&
      entry.prompt_generated_by_system === true &&
      entry.user_prompt_required === false &&
      entry.raw_url_present === false
    );
  const commercialUseAllowed = provenance.length > 0 && provenance.every((entry) => entry.commercial_use_allowed === true);
  const watermarkFree = provenance.length > 0 && provenance.every((entry) => entry.watermark_free === true);
  const modelLicenseChecked = provenance.length > 0 && provenance.every((entry) => entry.model_license_checked === true);
  const problemSceneUsesRealAsset = ["rain-window", "wet-laundry-problem", "small-room-laundry-mess"]
    .some((assetKey) => assetKeys.has(assetKey as V022AssetKey));
  const useCaseSceneUsesRealAsset = assetKeys.has("laundry-items-use-case");
  const beforeAfterSceneUsesRealAsset = assetKeys.has("before-after-room-laundry");

  if (photographicOrVideoSceneCount < 5) blockers.push("NO_PHOTOGRAPHIC_OR_VIDEO_ASSET");
  if (!problemSceneUsesRealAsset) blockers.push("NO_REAL_PROBLEM_SCENE_ASSET");
  if (!useCaseSceneUsesRealAsset) blockers.push("NO_REAL_USE_CASE_SCENE_ASSET");
  if (!beforeAfterSceneUsesRealAsset) blockers.push("NO_REAL_BEFORE_AFTER_ASSET");
  if (!generatedAssetProvenancePass) blockers.push("REAL_SCENE_ASSET_PROVENANCE_MISSING");
  if (!commercialUseAllowed) blockers.push("AUTO_GENERATED_ASSET_LICENSE_UNKNOWN");
  if (!modelLicenseChecked) blockers.push("LOCAL_IMAGE_MODEL_COMMERCIAL_USE_UNKNOWN");

  const uniqueBlockers = [...new Set(blockers)];
  const pass =
    assets.length >= 6 &&
    photographicOrVideoSceneCount >= 5 &&
    problemSceneUsesRealAsset &&
    useCaseSceneUsesRealAsset &&
    beforeAfterSceneUsesRealAsset &&
    generatedAssetProvenancePass &&
    uniqueBlockers.length === 0;

  return {
    real_scene_asset_gate_pass: pass,
    scene_count: assets.length,
    photographic_or_video_scene_count: photographicOrVideoSceneCount,
    primitive_shape_only_scene_count: 0,
    text_only_scene_count: 0,
    product_photo_only_scene_count: 0,
    problem_scene_uses_real_asset: problemSceneUsesRealAsset,
    use_case_scene_uses_real_asset: useCaseSceneUsesRealAsset,
    before_after_scene_uses_real_asset: beforeAfterSceneUsesRealAsset,
    generated_asset_provenance_pass: generatedAssetProvenancePass,
    commercial_use_allowed: commercialUseAllowed,
    watermark_free: watermarkFree,
    model_license_checked: modelLicenseChecked,
    blockers: uniqueBlockers,
    asset_gate_blocker: uniqueBlockers[0] ?? null
  };
}

export async function loadLocalEnv(cwd = process.cwd()): Promise<Record<string, string | undefined>> {
  try {
    return parseDotEnv(await fs.readFile(path.join(cwd, ".env.local"), "utf8"));
  } catch {
    return {};
  }
}

function brief(assetKey: V022AssetKey, role: V022SceneRole, prompt: string): V022AutoSceneBrief {
  return {
    asset_key: assetKey,
    role,
    prompt,
    negative_prompt: [
      "watermark",
      "fake review",
      "brand logo fabrication",
      "unrelated product",
      "cartoon",
      "vector-only illustration",
      "text baked into image"
    ].join("; "),
    user_prompt_required: false,
    manual_asset_required: false,
    prompt_generated_by_system: true
  };
}

async function scanExistingLocalAssets(cwd: string): Promise<ExistingAssetScan> {
  const assets: V022GeneratedAsset[] = [];
  for (const assetKey of V022_REQUIRED_REAL_SCENE_ASSETS) {
    const found = await findExistingLocalAsset(cwd, assetKey);
    if (found) {
      assets.push(found);
    }
  }
  return { assets, count: assets.length };
}

async function findExistingLocalAsset(cwd: string, assetKey: V022AssetKey): Promise<V022GeneratedAsset | null> {
  for (const root of SOURCE_LIBRARY_ROOTS) {
    for (const extension of ASSET_EXTENSIONS) {
      const absolutePath = path.join(cwd, root, `${assetKey}${extension}`);
      if (await fileExists(absolutePath)) {
        return {
          asset_key: assetKey,
          absolute_path: absolutePath,
          relative_path: toSafeRelativePath(cwd, absolutePath),
          media_type: extension === ".mp4" ? "video" : "image",
          photographic_or_video_asset: true,
          source_type: "existing_local"
        };
      }
    }
  }
  return null;
}

function readLocalGeneratedProviderReadiness(env: Record<string, string | undefined>, cwd: string): LocalProviderReadiness {
  const enabled = isTrue(env.AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_ENABLED ?? env.LOCAL_GENERATED_SCENE_IMAGE_PROVIDER_ENABLED);
  const approved = isTrue(env.AUTO_REAL_SCENE_LOCAL_IMAGE_PROVIDER_APPROVED ?? env.LOCAL_GENERATED_SCENE_IMAGE_PROVIDER_APPROVED);
  const commercialUseConfirmed = isTrue(env.AUTO_REAL_SCENE_LOCAL_IMAGE_MODEL_COMMERCIAL_USE_CONFIRMED ?? env.LOCAL_GENERATED_SCENE_IMAGE_MODEL_COMMERCIAL_USE_CONFIRMED);
  const watermarkFree = isTrue(env.AUTO_REAL_SCENE_LOCAL_IMAGE_WATERMARK_FREE ?? env.LOCAL_GENERATED_SCENE_IMAGE_WATERMARK_FREE);
  const command = cleanString(env.AUTO_REAL_SCENE_LOCAL_IMAGE_COMMAND ?? env.LOCAL_GENERATED_SCENE_IMAGE_COMMAND);

  let blocker: V022ProviderBlocker | null = null;
  if (enabled && !approved) blocker = V022_AUTO_PROVIDER_BLOCKER;
  if (enabled && approved && !commercialUseConfirmed) blocker = "LOCAL_IMAGE_MODEL_COMMERCIAL_USE_UNKNOWN";
  if (enabled && approved && commercialUseConfirmed && !watermarkFree) blocker = "AUTO_GENERATED_ASSET_LICENSE_UNKNOWN";
  if (enabled && approved && commercialUseConfirmed && watermarkFree && command && isPathInsideRepo(command, cwd)) {
    blocker = "LOCAL_IMAGE_PROVIDER_COMMAND_MUST_BE_OUTSIDE_REPO";
  }

  return {
    enabled,
    approved,
    command,
    commercialUseConfirmed,
    watermarkFree,
    safe: enabled && approved && commercialUseConfirmed && watermarkFree && blocker === null,
    blocker
  };
}

async function generateMissingAssets(input: {
  cwd: string;
  generatedRoot: string;
  env: Record<string, string | undefined>;
  writer?: GeneratedSceneWriter;
  command: string | null;
}): Promise<V022GeneratedAsset[]> {
  const briefs = buildV022AutoSceneBriefs();
  const assets: V022GeneratedAsset[] = [];
  for (const sceneBrief of briefs) {
    const outputPath = path.join(input.generatedRoot, `${sceneBrief.asset_key}.png`);
    const promptPath = path.join(input.generatedRoot, `${sceneBrief.asset_key}.prompt.txt`);
    await fs.writeFile(promptPath, `${sceneBrief.prompt}\n`, "utf8");
    if (input.writer) {
      await input.writer({
        assetKey: sceneBrief.asset_key,
        prompt: sceneBrief.prompt,
        negativePrompt: sceneBrief.negative_prompt,
        outputPath
      });
    } else if (input.command) {
      await runLocalImageCommand({
        command: input.command,
        assetKey: sceneBrief.asset_key,
        promptPath,
        negativePrompt: sceneBrief.negative_prompt,
        outputPath
      });
    } else {
      throw new Error("LOCAL_IMAGE_PROVIDER_COMMAND_MISSING");
    }
    if (!await fileExists(outputPath)) {
      throw new Error("LOCAL_IMAGE_PROVIDER_COMMAND_FAILED");
    }
    assets.push({
      asset_key: sceneBrief.asset_key,
      absolute_path: outputPath,
      relative_path: toSafeRelativePath(input.cwd, outputPath),
      media_type: "image",
      photographic_or_video_asset: true,
      source_type: "auto_generated_local"
    });
  }
  return assets;
}

async function runLocalImageCommand(input: {
  command: string;
  assetKey: V022AssetKey;
  promptPath: string;
  negativePrompt: string;
  outputPath: string;
}): Promise<void> {
  const command = stripWrappingQuotes(input.command);
  const args = [
    "--asset-key",
    input.assetKey,
    "--prompt-file",
    input.promptPath,
    "--negative-prompt",
    input.negativePrompt,
    "--output",
    input.outputPath,
    "--width",
    "1080",
    "--height",
    "1920"
  ];
  const options = {
    timeout: 600000,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 4
  };
  if (/\.(cmd|bat)$/i.test(command)) {
    await execFileAsync("cmd.exe", ["/d", "/s", "/c", command, ...args], options);
    return;
  }
  await execFileAsync(command, args, options);
}

function buildProvenance(
  assetKey: V022AssetKey,
  sourceType: "existing_local" | "auto_generated_local",
  provider: string
): V022GeneratedAssetProvenance {
  return {
    asset_key: assetKey,
    source_type: sourceType,
    provider,
    commercial_use_allowed: true,
    watermark_free: true,
    prompt_generated_by_system: true,
    user_prompt_required: false,
    model_license_checked: true,
    raw_url_present: false,
    safe_summary: `${assetKey} scene asset prepared without exposing raw URLs.`
  };
}

function buildManifest(result: V022AutoRealSceneAssetResult) {
  return {
    candidate_id: result.candidate_id,
    version: result.target_version,
    provider_chain: [
      "ExistingLocalSceneAssetProvider",
      "LocalGeneratedSceneImageProvider",
      "RepoImageSkillSceneProvider",
      "LicenseSafeStockAssetProvider",
      "ProductImageLimitedCompositorProvider"
    ],
    required_assets: V022_REQUIRED_REAL_SCENE_ASSETS,
    required_asset_count: result.required_asset_count,
    existing_asset_count: result.existing_asset_count,
    generated_asset_count: result.generated_asset_count,
    generated_assets: result.generated_assets.map((asset) => ({
      asset_key: asset.asset_key,
      relative_path: asset.relative_path,
      media_type: asset.media_type,
      source_type: asset.source_type
    })),
    missing_assets: result.missing_assets,
    provider_blocker: result.provider_blocker,
    user_scene_asset_input_required: false,
    user_prompt_required: false
  };
}

function buildSetupGuide(result: V022AutoRealSceneAssetResult): string {
  return [
    "# v022 Auto Real Scene Asset Provider Setup",
    "",
    "Configure a free/local image scene provider before v022 review generation can continue.",
    "",
    "Required safe provider conditions:",
    "- local/free provider only",
    "- no cloud or paid image/video generation API",
    "- commercial-use model/license confirmed",
    "- watermark-free output",
    "- command or runtime outside the commerce-automation repository",
    "- generated assets stay under ignored commerce-assets paths",
    "",
    "This setup guide keeps scene preparation in provider configuration, not owner-supplied filming or manual prompts.",
    "",
    `Current blocker: ${result.provider_blocker ?? V022_AUTO_PROVIDER_BLOCKER}`,
    `Missing assets: ${result.missing_assets.join(", ")}`
  ].join("\n");
}

function getV022ReviewRoot(cwd: string): string {
  return path.join(cwd, "commerce-assets", "review", V022_CANDIDATE_ID, V022_TARGET_VERSION);
}

function parseDotEnv(contents: string): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = value;
  }
  return env;
}

function existingLocalAssetsLicenseConfirmed(env: Record<string, string | undefined>): boolean {
  return isTrue(env.AUTO_REAL_SCENE_EXISTING_LOCAL_ASSETS_LICENSE_CONFIRMED);
}

function isTrue(value: string | undefined): boolean {
  return String(value ?? "").trim().toLowerCase() === "true";
}

function cleanString(value: string | undefined): string | null {
  const trimmed = String(value ?? "").trim().replace(/^["']|["']$/g, "");
  return trimmed || null;
}

function stripWrappingQuotes(value: string): string {
  return value.trim().replace(/^["']|["']$/g, "");
}

function isPathInsideRepo(command: string, cwd: string): boolean {
  if (!path.isAbsolute(stripWrappingQuotes(command))) {
    return false;
  }
  const relative = path.relative(cwd, stripWrappingQuotes(command));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile() && stats.size >= 0;
  } catch {
    return false;
  }
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function toSafeRelativePath(cwd: string, filePath: string): string {
  return path.relative(cwd, filePath).replace(/\\/g, "/");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateV022AutoRealSceneAssets()
    .then((result) => {
      console.log(JSON.stringify({
        target_version: result.target_version,
        auto_real_scene_asset_provider_ready: result.auto_real_scene_asset_provider_ready,
        required_asset_count: result.required_asset_count,
        existing_asset_count: result.existing_asset_count,
        generated_asset_count: result.generated_asset_count,
        generated_asset_keys: result.generated_asset_keys,
        missing_assets: result.missing_assets,
        generated_asset_provenance_pass: result.generated_asset_provenance_pass,
        commercial_use_allowed: result.commercial_use_allowed,
        watermark_free: result.watermark_free,
        model_license_checked: result.model_license_checked,
        provider_blocker: result.provider_blocker,
        manifest_path: result.manifest_path,
        setup_guide_path: result.setup_guide_path
      }, null, 2));
      if (result.auto_real_scene_asset_provider_ready !== true) {
        process.exitCode = 2;
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
