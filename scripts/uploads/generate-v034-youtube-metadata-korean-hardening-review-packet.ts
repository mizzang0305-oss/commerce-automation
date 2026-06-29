import { writeV034YoutubeMetadataReviewPacket } from "../../src/lib/uploads/youtube/youtubeMetadataHardening";

const CANDIDATE_ID = "candidate-3c4f2ee364ba5b07";
const DEFAULT_REDACTED_AFFILIATE_URL = "https://link.coupang.com/a/v034-local-review";
const V033_UPLOADED_VIDEO_ID = "ldSNhRKJLe0";

async function main() {
  const result = await writeV034YoutubeMetadataReviewPacket({
    cwd: process.cwd(),
    candidate_id: process.env.V034_CANDIDATE_ID ?? CANDIDATE_ID,
    selected_affiliate_url: process.env.V034_SELECTED_AFFILIATE_URL ?? DEFAULT_REDACTED_AFFILIATE_URL,
    v033_uploaded_video_id: process.env.V033_UPLOADED_VIDEO_ID ?? V033_UPLOADED_VIDEO_ID
  });

  console.log(JSON.stringify({
    FINAL_STATUS: result.FINAL_STATUS,
    candidate_id: result.candidate_id,
    version: result.version,
    human_review_status: result.human_review_status,
    private_upload_allowed: result.private_upload_allowed,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: result.SAFE_TO_REQUEST_PRIVATE_UPLOAD,
    PUBLIC_UPLOAD_BLOCKED: result.PUBLIC_UPLOAD_BLOCKED,
    youtube_metadata_preview_json: result.artifact_paths.youtube_metadata_preview_json,
    youtube_metadata_preview_html: result.artifact_paths.youtube_metadata_preview_html,
    sanitized_upload_request_preview: result.artifact_paths.sanitized_upload_request_preview,
    utf8_roundtrip_report: result.artifact_paths.utf8_roundtrip_report,
    placeholder_scan_report: result.artifact_paths.placeholder_scan_report,
    post_upload_metadata_verification_plan: result.artifact_paths.post_upload_metadata_verification_plan,
    raw_urls_printed: false,
    youtube_execute_called: false,
    videos_insert_called: false
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    error: "V034_YOUTUBE_METADATA_HARDENING_REVIEW_PACKET_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exitCode = 1;
});
