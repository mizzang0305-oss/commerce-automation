import { containsCoupangPartnersDisclosure } from "./youtubeDisclosurePayload";

const YOUTUBE_COMMENT_THREADS_URL =
  "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet";

export type V055CommentVisibilityBlocker =
  | "COMMENT_INSERT_REPORTED_BUT_NOT_VISIBLE"
  | "COMMENT_LINK_MISSING_AFTER_INSERT"
  | "COUPANG_DISCLOSURE_MISSING_AFTER_INSERT";

export type V055CommentVisibilityVerification = {
  ok: boolean;
  blocker: V055CommentVisibilityBlocker | null;
  comment_id_exists: boolean;
  affiliate_link_visible: boolean;
  coupang_disclosure_visible: boolean;
  comment_visible: boolean;
  raw_urls_printed: false;
  secrets_printed: false;
};

export async function verifyInsertedCommentVisibility(input: {
  videoId: string;
  commentId: string;
  expectedAffiliateUrl: string;
  accessToken: string;
  fetchImpl?: typeof fetch;
}): Promise<V055CommentVisibilityVerification> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = new URL(YOUTUBE_COMMENT_THREADS_URL);
  url.searchParams.set("videoId", input.videoId);

  const response = await fetchImpl(url, {
    method: "GET",
    headers: new Headers({
      Authorization: `Bearer ${input.accessToken}`
    })
  });
  const payload = await safeJson(response);
  const expectedAffiliateUrl = input.expectedAffiliateUrl.trim();
  const commentText = response.ok
    ? findCommentText(payload, input.commentId)
    : "";
  const commentIdExists = Boolean(commentText);
  const affiliateLinkVisible = commentIdExists && Boolean(expectedAffiliateUrl) && commentText.includes(expectedAffiliateUrl);
  const coupangDisclosureVisible = commentIdExists && containsCoupangPartnersDisclosure(commentText);
  const blocker = !commentIdExists
    ? "COMMENT_INSERT_REPORTED_BUT_NOT_VISIBLE"
    : !affiliateLinkVisible
      ? "COMMENT_LINK_MISSING_AFTER_INSERT"
      : !coupangDisclosureVisible
        ? "COUPANG_DISCLOSURE_MISSING_AFTER_INSERT"
        : null;

  return {
    ok: blocker === null,
    blocker,
    comment_id_exists: commentIdExists,
    affiliate_link_visible: affiliateLinkVisible,
    coupang_disclosure_visible: coupangDisclosureVisible,
    comment_visible: blocker === null,
    raw_urls_printed: false,
    secrets_printed: false
  };
}

function findCommentText(payload: Record<string, unknown>, commentId: string) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id === "string" && row.id !== commentId) continue;
    const text = extractTopLevelCommentText(row);
    if (text) return text;
  }
  return "";
}

function extractTopLevelCommentText(row: Record<string, unknown>) {
  const snippet = objectValue(row.snippet);
  const topLevelComment = objectValue(snippet?.topLevelComment);
  const topLevelSnippet = objectValue(topLevelComment?.snippet);
  const text = topLevelSnippet?.textOriginal;
  return typeof text === "string" ? text : "";
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const json = await response.json();
    return json && typeof json === "object" && !Array.isArray(json) ? json as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
