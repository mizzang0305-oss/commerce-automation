import { pathToFileURL } from "node:url";

import {
  buildV073UploadPackageGeneratorCliInput,
  generateV073UploadPackages
} from "../../src/uploads/multi-channel/v073UploadPackageGenerator";
import {
  buildV074UpstreamPackageReadinessFromV073Report,
  executeV074PublicUploadPreflight
} from "../../src/uploads/youtube/v074PublicUploadExecutor";

async function main() {
  const packageResult = await generateV073UploadPackages(buildV073UploadPackageGeneratorCliInput({
    cwd: process.cwd(),
    env: process.env
  }));
  const firstPackage = packageResult.packages[0] ?? null;

  if (!firstPackage) {
    console.log(JSON.stringify({
      version: "v074",
      FINAL_STATUS: "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY",
      blocker: packageResult.report.blocker ?? "BLOCKED_V074_UPLOAD_PACKAGE_NOT_READY",
      upload_package_count: packageResult.report.upload_package_count,
      SAFE_TO_UPLOAD: false,
      safeToUpload: false,
      uploadExecutionCalled: false,
      youtube_execute_called: false,
      videos_insert_called: false,
      videos_insert_total_count: 0,
      comment_create_update_delete_called: false,
      raw_urls_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    }, null, 2));
    return;
  }

  const preflight = await executeV074PublicUploadPreflight({
    uploadPackage: firstPackage,
    upstreamPackageReadiness: buildV074UpstreamPackageReadinessFromV073Report({
      uploadPackage: firstPackage,
      report: packageResult.report
    })
  });

  console.log(JSON.stringify({
    FINAL_STATUS: preflight.report.FINAL_STATUS,
    blocker: preflight.report.blocker,
    packageId: preflight.report.packageId,
    channelKey: preflight.report.channelKey,
    videoAssetHashPrefix: preflight.report.videoAssetHashPrefix,
    metadataReady: preflight.report.metadataReady,
    disclosureReady: preflight.report.disclosureReady,
    targetChannelHashPrefix: preflight.report.targetChannelHashPrefix,
    advancedSettingsReady: preflight.report.advancedSettingsReady,
    upstreamPackageReady: preflight.report.upstreamPackageReady,
    upstreamPackageBlocker: preflight.report.upstreamPackageBlocker,
    safetyGateReady: preflight.report.safetyGateReady,
    adapterMode: preflight.report.adapterMode,
    SAFE_TO_UPLOAD: preflight.report.SAFE_TO_UPLOAD,
    uploadExecutionCalled: preflight.report.uploadExecutionCalled,
    youtube_execute_called: preflight.report.youtube_execute_called,
    videos_insert_called: preflight.report.videos_insert_called,
    videos_insert_total_count: preflight.report.videos_insert_total_count,
    comment_create_update_delete_called: preflight.report.comment_create_update_delete_called,
    raw_urls_printed: preflight.report.raw_urls_printed,
    raw_channel_ids_printed: preflight.report.raw_channel_ids_printed,
    secrets_printed: preflight.report.secrets_printed,
    fake_success: preflight.report.fake_success
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "v074 public upload preflight failed");
    process.exitCode = 1;
  });
}
