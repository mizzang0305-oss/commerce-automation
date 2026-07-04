import { pathToFileURL } from "node:url";

import {
  buildV070ProductSourceMaterializerCliInput,
  materializeV057ProductSourceMetadata,
  writeV070ProductSourceMaterializerArtifacts
} from "../../src/uploads/multi-channel/v057ProductSourceMaterializer";

async function main() {
  const report = await materializeV057ProductSourceMetadata(buildV070ProductSourceMaterializerCliInput({
    cwd: process.cwd(),
    env: process.env
  }));
  await writeV070ProductSourceMaterializerArtifacts({
    cwd: process.cwd(),
    report
  });

  console.log(JSON.stringify({
    FINAL_STATUS: report.FINAL_STATUS,
    blocker: report.blocker,
    product_source_materialized: report.product_source_materialized,
    product_source_ready: report.product_source_ready,
    SAFE_TO_UPLOAD: report.SAFE_TO_UPLOAD,
    videos_insert_called: report.videos_insert_called,
    comment_create_update_delete_called: report.comment_create_update_delete_called,
    raw_urls_printed: report.raw_urls_printed,
    raw_channel_ids_printed: report.raw_channel_ids_printed,
    secrets_printed: report.secrets_printed,
    fake_success: report.fake_success
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "v070 product source materializer failed");
    process.exitCode = 1;
  });
}
