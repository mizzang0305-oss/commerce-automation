import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { COMMERCE_DAILY_KST_SLOTS } from "@/lib/orchestration/commerceDailyCadence";

const MAX_DRAFT_VIDEO_BYTES = 100 * 1024 * 1024;

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slotId: string }> }
) {
  const { slotId } = await context.params;
  if (!COMMERCE_DAILY_KST_SLOTS.some((slot) => slot.id === slotId)) {
    return new Response("Not found", { status: 404 });
  }
  const root = path.resolve(process.cwd(), "data", "commerce-poc", "video-drafts");
  const videoPath = path.resolve(root, slotId, "preview.mp4");
  if (!videoPath.startsWith(`${root}${path.sep}`)) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const fileStat = await stat(videoPath);
    if (!fileStat.isFile() || fileStat.size <= 0 || fileStat.size > MAX_DRAFT_VIDEO_BYTES) {
      return new Response("Not found", { status: 404 });
    }
    const video = await readFile(videoPath);
    return new Response(new Uint8Array(video), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `inline; filename="${slotId}-draft-preview.mp4"`,
        "Content-Length": String(video.byteLength),
        "Content-Type": "video/mp4",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
