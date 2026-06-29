import fs from "node:fs/promises";
import path from "node:path";

export const V034_COUPANG_DISCLOSURE =
  "\u203b \uc774 \ucf58\ud150\uce20\ub294 \ucfe0\ud321 \ud30c\ud2b8\ub108\uc2a4 \ud65c\ub3d9\uc758 \uc77c\ud658\uc73c\ub85c, \uc774\uc5d0 \ub530\ub978 \uc77c\uc815\uc561\uc758 \uc218\uc218\ub8cc\ub97c \uc81c\uacf5\ubc1b\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.";

export const V034_DEFAULT_TITLE =
  "\ubbfc\uc988 \ucee4\uba38\uc2a4 v034 \ube68\ub798\uac74\uc870\ub300 \uccb4\ud06c \ud3ec\uc778\ud2b8";

export const V034_DEFAULT_DESCRIPTION = [
  "[\uc0c1\ud488 \ud655\uc778]",
  "\uad6c\uc131\uacfc \uac00\uaca9\uc740 \uc0c1\ud488 \uc124\uba85\uc5d0\uc11c \ud655\uc778\ud558\uc138\uc694.",
  "",
  "[\uc7a5\ub9c8\ucca0 \uccb4\ud06c \ud3ec\uc778\ud2b8]",
  "\ube44 \uc624\ub294 \ub0a0\uc5d0\ub294 \ube68\ub798\uac00 \ub2a6\uac8c \ub9c8\ub974\uace0 \uc2e4\ub0b4 \uc2b5\uae30\uac00 \ub0a8\uc744 \uc218 \uc788\uc2b5\ub2c8\ub2e4.",
  "\uc811\uc774\uc2dd \ube68\ub798\uac74\uc870\ub300\ub294 \uc881\uc740 \uacf5\uac04\uc5d0\uc11c\ub3c4 \ube68\ub798\ub97c \ud3bc\uccd0 \ub9d0\ub9b4 \ub54c \uc720\uc6a9\ud569\ub2c8\ub2e4.",
  "\uad6c\ub9e4 \uc804\uc5d0\ub294 \ud06c\uae30, \ud558\uc911, \uc811\uc5c8\uc744 \ub54c \ubcf4\uad00 \uacf5\uac04\uc744 \uaf2d \ud655\uc778\ud558\uc138\uc694.",
  "",
  "[\uace0\uc9c0]",
  V034_COUPANG_DISCLOSURE
].join("\n");

export type YouTubeKoreanMetadataBlockedReason =
  | "METADATA_MOJIBAKE_DETECTED"
  | "DESCRIPTION_CONTAINS_QUESTION_MARK_RUN"
  | "DESCRIPTION_CONTAINS_REPLACEMENT_CHAR"
  | "DESCRIPTION_CONTAINS_EXAMPLE_DOT_COM"
  | "DESCRIPTION_CONTAINS_PLACEHOLDER_URL"
  | "DESCRIPTION_CONTAINS_RAW_AFFILIATE_URL"
  | "COUPANG_DISCLOSURE_MISSING"
  | "KOREAN_METADATA_UTF8_ROUNDTRIP_FAIL"
  | "YOUTUBE_METADATA_PREVIEW_MISSING"
  | "POST_UPLOAD_METADATA_VERIFICATION_FAIL"
  | "TITLE_KOREAN_TEXT_MISSING"
  | "DESCRIPTION_KOREAN_TEXT_MISSING";

export type YouTubeKoreanMetadataGate = {
  title_contains_valid_korean_text: boolean;
  description_contains_valid_korean_text: boolean;
  description_contains_question_mark_run: boolean;
  description_contains_replacement_char: boolean;
  description_contains_example_dot_com: boolean;
  description_contains_placeholder_url: boolean;
  description_contains_raw_affiliate_url: boolean;
  coupang_disclosure_required: true;
  coupang_disclosure_present: boolean;
  korean_utf8_roundtrip_pass: boolean;
  json_roundtrip_pass: boolean;
  upload_request_body_preview_generated: boolean;
  local_metadata_preview_html_generated: boolean;
  post_upload_metadata_verification_plan: boolean;
  mojibake_question_mark_gate_added: true;
  placeholder_url_gate_added: true;
  example_com_blocked: boolean;
  raw_affiliate_url_blocked: boolean;
  metadata_preview_required: true;
  can_pass_metadata_gate: boolean;
  blocked_reasons: YouTubeKoreanMetadataBlockedReason[];
};

export type V034KoreanMetadataPreview = {
  candidate_id: string;
  version: "v034";
  metadata: {
    title: string;
    description: string;
    visibility: "private";
  };
  gate: YouTubeKoreanMetadataGate;
  sanitized_upload_request_preview: Record<string, unknown>;
  metadata_preview_html: string;
  utf8_roundtrip_report: {
    korean_utf8_roundtrip_pass: boolean;
    title_roundtrip_pass: boolean;
    description_roundtrip_pass: boolean;
    json_roundtrip_pass: boolean;
  };
  placeholder_scan_report: {
    placeholder_url_gate_added: true;
    example_com_blocked: boolean;
    placeholder_url_blocked: boolean;
    raw_affiliate_url_blocked: boolean;
    blocked_reasons: YouTubeKoreanMetadataBlockedReason[];
  };
  post_upload_metadata_verification_plan: {
    target_video_id: string | null;
    videos_insert_allowed: false;
    visibility_change_allowed: false;
    raw_url_output_allowed: false;
    checks: string[];
  };
};

export function validateYouTubeKoreanMetadata(input: {
  title: string;
  description: string;
  selected_affiliate_url?: string;
  disclosure_text?: string;
  upload_request_body_preview_generated?: boolean;
  local_metadata_preview_html_generated?: boolean;
  post_upload_metadata_verification_plan_generated?: boolean;
}): YouTubeKoreanMetadataGate {
  const title = safeTrim(input.title);
  const description = safeTrim(input.description);
  const selectedAffiliateUrl = safeTrim(input.selected_affiliate_url);
  const combined = `${title}\n${description}`;
  const titleContainsKorean = containsHangul(title);
  const descriptionContainsKorean = containsHangul(description);
  const questionMarkRun = /\?{2,}/.test(description);
  const replacementChar = description.includes("\uFFFD");
  const mojibakeDetected = questionMarkRun || replacementChar || /\u5360|\u00C3|\u00EC|\u00ED|\u00EA/.test(combined);
  const exampleDotCom = /example\.com/i.test(description);
  const placeholderUrl = /placeholder|<PLAIN_|PLAIN_HTTPS|example\.com|minz-commerce-v033-check/i.test(description);
  const rawAffiliateUrl =
    Boolean(selectedAffiliateUrl) &&
    (description.includes(selectedAffiliateUrl) || title.includes(selectedAffiliateUrl));
  const disclosurePresent = hasCoupangDisclosure(description, input.disclosure_text);
  const titleRoundtrip = utf8RoundtripPass(title);
  const descriptionRoundtrip = utf8RoundtripPass(description);
  const jsonRoundtrip = jsonRoundtripPass({ title, description });
  const uploadPreviewGenerated = input.upload_request_body_preview_generated === true;
  const htmlPreviewGenerated = input.local_metadata_preview_html_generated === true;
  const postUploadPlanGenerated = input.post_upload_metadata_verification_plan_generated === true;
  const blockedReasons: YouTubeKoreanMetadataBlockedReason[] = [];

  if (!titleContainsKorean) blockedReasons.push("TITLE_KOREAN_TEXT_MISSING");
  if (!descriptionContainsKorean) blockedReasons.push("DESCRIPTION_KOREAN_TEXT_MISSING");
  if (mojibakeDetected) blockedReasons.push("METADATA_MOJIBAKE_DETECTED");
  if (questionMarkRun) blockedReasons.push("DESCRIPTION_CONTAINS_QUESTION_MARK_RUN");
  if (replacementChar) blockedReasons.push("DESCRIPTION_CONTAINS_REPLACEMENT_CHAR");
  if (exampleDotCom) blockedReasons.push("DESCRIPTION_CONTAINS_EXAMPLE_DOT_COM");
  if (placeholderUrl) blockedReasons.push("DESCRIPTION_CONTAINS_PLACEHOLDER_URL");
  if (rawAffiliateUrl) blockedReasons.push("DESCRIPTION_CONTAINS_RAW_AFFILIATE_URL");
  if (!disclosurePresent) blockedReasons.push("COUPANG_DISCLOSURE_MISSING");
  if (!titleRoundtrip || !descriptionRoundtrip || !jsonRoundtrip) {
    blockedReasons.push("KOREAN_METADATA_UTF8_ROUNDTRIP_FAIL");
  }
  if (!uploadPreviewGenerated || !htmlPreviewGenerated) {
    blockedReasons.push("YOUTUBE_METADATA_PREVIEW_MISSING");
  }
  if (!postUploadPlanGenerated) {
    blockedReasons.push("POST_UPLOAD_METADATA_VERIFICATION_FAIL");
  }

  const uniqueBlockedReasons = [...new Set(blockedReasons)];

  return {
    title_contains_valid_korean_text: titleContainsKorean,
    description_contains_valid_korean_text: descriptionContainsKorean,
    description_contains_question_mark_run: questionMarkRun,
    description_contains_replacement_char: replacementChar,
    description_contains_example_dot_com: exampleDotCom,
    description_contains_placeholder_url: placeholderUrl,
    description_contains_raw_affiliate_url: rawAffiliateUrl,
    coupang_disclosure_required: true,
    coupang_disclosure_present: disclosurePresent,
    korean_utf8_roundtrip_pass: titleRoundtrip && descriptionRoundtrip,
    json_roundtrip_pass: jsonRoundtrip,
    upload_request_body_preview_generated: uploadPreviewGenerated,
    local_metadata_preview_html_generated: htmlPreviewGenerated,
    post_upload_metadata_verification_plan: postUploadPlanGenerated,
    mojibake_question_mark_gate_added: true,
    placeholder_url_gate_added: true,
    example_com_blocked: exampleDotCom,
    raw_affiliate_url_blocked: rawAffiliateUrl,
    metadata_preview_required: true,
    can_pass_metadata_gate: uniqueBlockedReasons.length === 0,
    blocked_reasons: uniqueBlockedReasons
  };
}

export function buildV034KoreanMetadataPreview(input: {
  candidate_id: string;
  selected_affiliate_url?: string;
  title?: string;
  description?: string;
  v033_uploaded_video_id?: string;
}): V034KoreanMetadataPreview {
  const candidateId = safeTrim(input.candidate_id);
  const selectedAffiliateUrl = safeTrim(input.selected_affiliate_url);
  const title = safeTrim(input.title) || V034_DEFAULT_TITLE;
  const description = safeTrim(input.description) || V034_DEFAULT_DESCRIPTION;
  const sanitizedUploadRequestPreview = {
    provider: "youtube",
    candidate_id: candidateId,
    title,
    description,
    visibility: "private",
    selected_affiliate_url: selectedAffiliateUrl ? "<AFFILIATE_URL_PRESENT>" : "<AFFILIATE_URL_MISSING>",
    selected_affiliate_url_present: Boolean(selectedAffiliateUrl),
    raw_affiliate_url_included: false,
    youtube_execute_allowed: false,
    videos_insert_allowed: false,
    public_upload_blocked: true,
    unlisted_upload_blocked: true
  };
  const metadataPreviewHtml = buildMetadataPreviewHtml({
    candidate_id: candidateId,
    title,
    description,
    selected_affiliate_url_present: Boolean(selectedAffiliateUrl)
  });
  const postUploadPlan = {
    target_video_id: safeTrim(input.v033_uploaded_video_id) || null,
    videos_insert_allowed: false as const,
    visibility_change_allowed: false as const,
    raw_url_output_allowed: false as const,
    checks: [
      "read_existing_video_metadata_sanitized",
      "confirm_title_has_no_mojibake",
      "confirm_description_has_no_mojibake",
      "confirm_example_com_absent",
      "confirm_placeholder_absent",
      "confirm_coupang_disclosure_present",
      "confirm_visibility_unchanged"
    ]
  };
  const gate = validateYouTubeKoreanMetadata({
    title,
    description,
    selected_affiliate_url: selectedAffiliateUrl,
    disclosure_text: V034_COUPANG_DISCLOSURE,
    upload_request_body_preview_generated: true,
    local_metadata_preview_html_generated: true,
    post_upload_metadata_verification_plan_generated: true
  });

  return {
    candidate_id: candidateId,
    version: "v034",
    metadata: {
      title,
      description,
      visibility: "private"
    },
    gate,
    sanitized_upload_request_preview: sanitizedUploadRequestPreview,
    metadata_preview_html: metadataPreviewHtml,
    utf8_roundtrip_report: {
      korean_utf8_roundtrip_pass: gate.korean_utf8_roundtrip_pass,
      title_roundtrip_pass: utf8RoundtripPass(title),
      description_roundtrip_pass: utf8RoundtripPass(description),
      json_roundtrip_pass: gate.json_roundtrip_pass
    },
    placeholder_scan_report: {
      placeholder_url_gate_added: true,
      example_com_blocked: gate.description_contains_example_dot_com,
      placeholder_url_blocked: gate.description_contains_placeholder_url,
      raw_affiliate_url_blocked: gate.description_contains_raw_affiliate_url,
      blocked_reasons: gate.blocked_reasons.filter((reason) =>
        reason === "DESCRIPTION_CONTAINS_EXAMPLE_DOT_COM" ||
        reason === "DESCRIPTION_CONTAINS_PLACEHOLDER_URL" ||
        reason === "DESCRIPTION_CONTAINS_RAW_AFFILIATE_URL"
      )
    },
    post_upload_metadata_verification_plan: postUploadPlan
  };
}

export function buildV033MetadataFailureDecision(input: { video_id?: string } = {}) {
  return {
    version: "v033",
    video_id: safeTrim(input.video_id) || null,
    review_status: "FAIL_METADATA_REVIEW",
    human_review_status: "FAIL_METADATA_REVIEW",
    private_upload_allowed: false,
    safe_to_request_private_upload: false,
    requires_fresh_upload_approval: true,
    fail_reasons: [
      "YOUTUBE_DESCRIPTION_MOJIBAKE",
      "KOREAN_TEXT_RENDERED_AS_QUESTION_MARKS",
      "PLACEHOLDER_URL_EXAMPLE_COM_EXPOSED",
      "METADATA_PREFLIGHT_FALSE_NEGATIVE",
      "DISCLOSURE_TEXT_NOT_VERIFIED_AFTER_UPLOAD"
    ],
    corrective_action_required: "BUILD_V034_KOREAN_METADATA_HARDENING_REVIEW_PACKET"
  };
}

export async function writeV034YoutubeMetadataReviewPacket(input: {
  cwd: string;
  candidate_id: string;
  selected_affiliate_url?: string;
  v033_uploaded_video_id?: string;
}) {
  const cwd = input.cwd;
  const candidateId = safeTrim(input.candidate_id);
  const v033Root = path.join(cwd, "commerce-assets", "review", candidateId, "v033");
  const v034Root = path.join(cwd, "commerce-assets", "review", candidateId, "v034");
  const preview = buildV034KoreanMetadataPreview(input);
  const v033FailureDecisionPath = path.join(v033Root, "human-review-decision.json");
  const artifactPaths = {
    youtube_metadata_preview_json: path.join(v034Root, "youtube-metadata-preview.json"),
    youtube_metadata_preview_html: path.join(v034Root, "youtube-metadata-preview.html"),
    sanitized_upload_request_preview: path.join(v034Root, "youtube-upload-request-sanitized.json"),
    utf8_roundtrip_report: path.join(v034Root, "metadata-utf8-roundtrip-report.json"),
    placeholder_scan_report: path.join(v034Root, "metadata-placeholder-scan.json"),
    post_upload_metadata_verification_plan: path.join(v034Root, "post-upload-metadata-verification-plan.json")
  };
  const result = {
    FINAL_STATUS: "V034_METADATA_GATE_READY",
    candidate_id: candidateId,
    version: "v034",
    v033_failure_decision_path: v033FailureDecisionPath,
    artifact_paths: artifactPaths,
    human_review_status: "PENDING_METADATA_REVIEW",
    private_upload_allowed: false,
    requires_fresh_upload_approval: true,
    SAFE_TO_REQUEST_PRIVATE_UPLOAD: false,
    PUBLIC_UPLOAD_BLOCKED: true,
    youtube_execute_called: false,
    videos_insert_called: false,
    public_upload: false,
    unlisted_upload: false,
    r2_upload: false,
    product_assets_write: false,
    db_write: false,
    raw_urls_printed: false,
    secrets_printed: false
  };

  await writeJson(v033FailureDecisionPath, buildV033MetadataFailureDecision({
    video_id: input.v033_uploaded_video_id
  }));
  await writeJson(artifactPaths.youtube_metadata_preview_json, {
    FINAL_STATUS: result.FINAL_STATUS,
    candidate_id: candidateId,
    version: "v034",
    metadata: preview.metadata,
    gate: preview.gate,
    public_upload_blocked: true
  });
  await writeText(artifactPaths.youtube_metadata_preview_html, preview.metadata_preview_html);
  await writeJson(artifactPaths.sanitized_upload_request_preview, preview.sanitized_upload_request_preview);
  await writeJson(artifactPaths.utf8_roundtrip_report, preview.utf8_roundtrip_report);
  await writeJson(artifactPaths.placeholder_scan_report, preview.placeholder_scan_report);
  await writeJson(artifactPaths.post_upload_metadata_verification_plan, preview.post_upload_metadata_verification_plan);

  return result;
}

function buildMetadataPreviewHtml(input: {
  candidate_id: string;
  title: string;
  description: string;
  selected_affiliate_url_present: boolean;
}) {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>v034 YouTube Metadata Preview</title>
  <style>
    body{margin:0;padding:24px;font-family:Arial,"Malgun Gothic",sans-serif;color:#111827;background:#f8fafc}
    main{max-width:880px;margin:0 auto;background:white;border:1px solid #d1d5db;padding:20px}
    pre{white-space:pre-wrap;background:#f3f4f6;padding:12px;border:1px solid #e5e7eb}
    .ok{color:#166534;font-weight:700}
  </style>
</head>
<body>
  <main>
    <h1>v034 YouTube Metadata Preview</h1>
    <p class="ok">UTF-8 Korean metadata review only. Upload remains blocked.</p>
    <p>candidate_id: ${escapeHtml(input.candidate_id)}</p>
    <p>selected_affiliate_url_present: ${input.selected_affiliate_url_present}</p>
    <h2>Title</h2>
    <pre>${escapeHtml(input.title)}</pre>
    <h2>Description</h2>
    <pre>${escapeHtml(input.description)}</pre>
  </main>
</body>
</html>
`;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(filePath: string, value: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, value, "utf8");
}

function hasCoupangDisclosure(description: string, disclosureText?: string) {
  const explicitDisclosure = safeTrim(disclosureText);
  if (explicitDisclosure && description.includes(explicitDisclosure)) {
    return true;
  }
  return description.includes("\ucfe0\ud321") &&
    description.includes("\ud30c\ud2b8\ub108\uc2a4") &&
    description.includes("\uc218\uc218\ub8cc");
}

function containsHangul(value: string) {
  return /[\uac00-\ud7a3]/.test(value);
}

function utf8RoundtripPass(value: string) {
  return Buffer.from(value, "utf8").toString("utf8") === value;
}

function jsonRoundtripPass(value: unknown) {
  try {
    return JSON.stringify(JSON.parse(JSON.stringify(value))) === JSON.stringify(value);
  } catch {
    return false;
  }
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeTrim(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
