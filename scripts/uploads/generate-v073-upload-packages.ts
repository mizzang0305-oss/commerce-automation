import { pathToFileURL } from "node:url";

import {
  buildV073UploadPackageGeneratorCliInput,
  generateV073UploadPackages,
  writeV073UploadPackageArtifacts
} from "../../src/uploads/multi-channel/v073UploadPackageGenerator";

async function main() {
  const result = await generateV073UploadPackages(buildV073UploadPackageGeneratorCliInput({
    cwd: process.cwd(),
    env: process.env
  }));

  await writeV073UploadPackageArtifacts({
    cwd: process.cwd(),
    result
  });

  console.log(JSON.stringify({
    FINAL_STATUS: result.report.FINAL_STATUS,
    blocker: result.report.blocker,
    upload_package_generator_ready: result.report.upload_package_generator_ready,
    upload_package_count: result.report.upload_package_count,
    SAFE_TO_UPLOAD: result.report.SAFE_TO_UPLOAD,
    videos_insert_called: result.report.videos_insert_called,
    comment_create_update_delete_called: result.report.comment_create_update_delete_called,
    raw_urls_printed: result.report.raw_urls_printed,
    raw_channel_ids_printed: result.report.raw_channel_ids_printed,
    secrets_printed: result.report.secrets_printed,
    fake_success: result.report.fake_success
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "v073 upload package generation failed");
    process.exitCode = 1;
  });
}
