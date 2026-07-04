import {
  generateV073UploadPackages,
  type V073DisclosureOverride
} from "./v073UploadPackageGenerator";
import type { V073UploadPackageGenerationResult } from "./v073UploadPackage";

export type V073UploadPackageReadinessResult = V073UploadPackageGenerationResult & {
  readinessMode: "no_upload";
};

export async function buildV073UploadPackageReadiness(input: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  uploadAssetProfile?: string | null;
  now?: string;
  disclosureOverrides?: V073DisclosureOverride;
} = {}): Promise<V073UploadPackageReadinessResult> {
  const result = await generateV073UploadPackages(input);
  return {
    ...result,
    readinessMode: "no_upload"
  };
}
