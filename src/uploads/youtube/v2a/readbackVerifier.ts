export type YouTubeVideoReadback = {
  id?: unknown;
  snippet?: {
    channelId?: unknown;
    title?: unknown;
    description?: unknown;
    tags?: unknown;
    categoryId?: unknown;
  } | null;
  status?: { privacyStatus?: unknown; selfDeclaredMadeForKids?: unknown } | null;
};

export type YouTubeReadbackExpectation = {
  videoId: string;
  targetChannelId: string;
  title: string;
  descriptionDigest: string;
  tags: readonly string[];
  categoryId: string;
  madeForKids: boolean;
};

export type YouTubeReadbackVerificationResult =
  | { ok: true; code: "READBACK_VERIFIED" }
  | {
      ok: false;
      code:
        | "READBACK_RESOURCE_INVALID"
        | "READBACK_VIDEO_ID_MISMATCH"
        | "READBACK_TARGET_CHANNEL_MISMATCH"
        | "READBACK_VISIBILITY_MISMATCH"
        | "READBACK_TITLE_MISMATCH"
        | "READBACK_METADATA_MISMATCH"
        | "READBACK_DESCRIPTION_DIGEST_MISMATCH";
    };

export type DescriptionDigest = (description: string) => string | Promise<string>;

export async function verifyYouTubeUploadReadback(input: {
  expected: YouTubeReadbackExpectation;
  resource: YouTubeVideoReadback | null | undefined;
  digestDescription: DescriptionDigest;
}): Promise<YouTubeReadbackVerificationResult> {
  const { expected, resource } = input;
  if (
    !resource ||
    !resource.snippet ||
    !resource.status ||
    typeof resource.id !== "string" ||
    typeof resource.snippet.channelId !== "string" ||
    typeof resource.snippet.title !== "string" ||
    typeof resource.snippet.description !== "string"
  ) {
    return { ok: false, code: "READBACK_RESOURCE_INVALID" };
  }
  if (resource.id !== expected.videoId) {
    return { ok: false, code: "READBACK_VIDEO_ID_MISMATCH" };
  }
  if (resource.snippet.channelId !== expected.targetChannelId) {
    return { ok: false, code: "READBACK_TARGET_CHANNEL_MISMATCH" };
  }
  if (resource.status.privacyStatus !== "private") {
    return { ok: false, code: "READBACK_VISIBILITY_MISMATCH" };
  }
  if (resource.snippet.title !== expected.title) {
    return { ok: false, code: "READBACK_TITLE_MISMATCH" };
  }
  if (!Array.isArray(resource.snippet.tags) ||
      JSON.stringify(resource.snippet.tags) !== JSON.stringify(expected.tags) ||
      resource.snippet.categoryId !== expected.categoryId ||
      resource.status.selfDeclaredMadeForKids !== expected.madeForKids) {
    return { ok: false, code: "READBACK_METADATA_MISMATCH" };
  }

  let actualDigest: string;
  try {
    actualDigest = await input.digestDescription(resource.snippet.description);
  } catch {
    return { ok: false, code: "READBACK_DESCRIPTION_DIGEST_MISMATCH" };
  }
  if (!constantTimeTextEqual(actualDigest, expected.descriptionDigest)) {
    return { ok: false, code: "READBACK_DESCRIPTION_DIGEST_MISMATCH" };
  }
  return { ok: true, code: "READBACK_VERIFIED" };
}

function constantTimeTextEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}
