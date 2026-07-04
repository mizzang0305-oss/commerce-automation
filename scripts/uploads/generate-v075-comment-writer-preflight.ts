import { pathToFileURL } from "node:url";

import {
  buildV073UploadPackageGeneratorCliInput,
  generateV073UploadPackages
} from "../../src/uploads/multi-channel/v073UploadPackageGenerator";
import { executeV075CommentWriterPreflight } from "../../src/uploads/youtube/v075CommentWriter";

async function main() {
  const packageResult = await generateV073UploadPackages(buildV073UploadPackageGeneratorCliInput({
    cwd: process.cwd(),
    env: process.env
  }));
  const firstPackage = packageResult.packages[0] ?? null;

  if (!firstPackage) {
    console.log(JSON.stringify({
      version: "v075",
      FINAL_STATUS: "BLOCKED_V075_COMMENT_WRITER_NOT_READY",
      blocker: packageResult.report.blocker ?? "BLOCKED_V075_UPLOAD_RESULT_MISSING",
      upload_package_count: packageResult.report.upload_package_count,
      SAFE_TO_UPLOAD: false,
      safeToUpload: false,
      commentCreateCalled: false,
      commentThreads_insert_called: false,
      comment_create_update_delete_called: false,
      youtube_execute_called: false,
      videos_insert_called: false,
      raw_urls_printed: false,
      raw_video_ids_printed: false,
      raw_channel_ids_printed: false,
      secrets_printed: false,
      fake_success: false
    }, null, 2));
    return;
  }

  const preflight = await executeV075CommentWriterPreflight({
    uploadPackage: firstPackage,
    uploadResult: null
  });

  console.log(JSON.stringify({
    FINAL_STATUS: preflight.report.FINAL_STATUS,
    blocker: preflight.report.blocker,
    uploadPackageId: preflight.report.uploadPackageId,
    channelKey: preflight.report.channelKey,
    videoIdPresent: preflight.report.videoIdPresent,
    videoIdHashPrefix: preflight.report.videoIdHashPrefix,
    affiliateUrlPresent: preflight.report.affiliateUrlPresent,
    affiliateUrlHashPrefix: preflight.report.affiliateUrlHashPrefix,
    disclosurePresent: preflight.report.disclosurePresent,
    commentTextReady: preflight.report.commentTextReady,
    uploadVisibility: preflight.report.uploadVisibility,
    uploadResultStatus: preflight.report.uploadResultStatus,
    targetChannelVerified: preflight.report.targetChannelVerified,
    duplicateGuardPassed: preflight.report.duplicateGuardPassed,
    publicUploadPackageReady: preflight.report.publicUploadPackageReady,
    safetyGateReady: preflight.report.safetyGateReady,
    adapterMode: preflight.report.adapterMode,
    SAFE_TO_UPLOAD: preflight.report.SAFE_TO_UPLOAD,
    commentCreateCalled: preflight.report.commentCreateCalled,
    commentThreads_insert_called: preflight.report.commentThreads_insert_called,
    comment_create_update_delete_called: preflight.report.comment_create_update_delete_called,
    youtube_execute_called: preflight.report.youtube_execute_called,
    videos_insert_called: preflight.report.videos_insert_called,
    raw_urls_printed: preflight.report.raw_urls_printed,
    raw_video_ids_printed: preflight.report.raw_video_ids_printed,
    raw_channel_ids_printed: preflight.report.raw_channel_ids_printed,
    secrets_printed: preflight.report.secrets_printed,
    fake_success: preflight.report.fake_success
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "v075 comment writer preflight failed");
    process.exitCode = 1;
  });
}
