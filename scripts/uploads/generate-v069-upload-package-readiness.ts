import {
  buildV069UploadPackageReadiness,
  writeV069UploadPackageReadinessArtifacts
} from "../../src/uploads/multi-channel/v069UploadPackageReadiness";

async function main() {
  const report = await buildV069UploadPackageReadiness({
    cwd: process.cwd(),
    env: process.env,
    uploadAssetProfile: process.env.V051_UPLOAD_ASSET_PROFILE ?? null
  });

  await writeV069UploadPackageReadinessArtifacts({
    cwd: process.cwd(),
    report
  });

  console.log(JSON.stringify({
    FINAL_STATUS: report.FINAL_STATUS,
    blocker: report.blocker,
    package_builder_ready: report.package_builder_ready,
    upload_package_ready: report.upload_package_ready,
    SAFE_TO_UPLOAD: report.SAFE_TO_UPLOAD,
    videos_insert_called: report.videos_insert_called,
    comment_create_update_delete_called: report.comment_create_update_delete_called,
    raw_urls_printed: report.raw_urls_printed,
    secrets_printed: report.secrets_printed
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "v069 readiness failed");
  process.exitCode = 1;
});
