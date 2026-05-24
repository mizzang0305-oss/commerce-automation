import { readFile, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_BUCKETS = new Set([
  "rendered-videos",
  "thumbnails",
  "subtitles",
  "sheet-exports",
  "upload-packages",
  "product-images"
]);

export async function GET(_request: Request, context: { params: Promise<{ bucket: string; path: string[] }> }) {
  if (!isMockStorageRouteEnabled()) {
    return NextResponse.json({ ok: false, message: "Not found." }, { status: 404 });
  }

  const { bucket, path } = await context.params;
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ ok: false, message: "Unknown storage bucket." }, { status: 404 });
  }

  const baseDir = resolve(
    /* turbopackIgnore: true */ process.cwd(),
    "python-worker",
    "outputs",
    "storage"
  );
  const targetPath = resolve(baseDir, bucket, ...path);
  const relativePath = relative(baseDir, targetPath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath)) {
    return NextResponse.json({ ok: false, message: "Invalid storage path." }, { status: 400 });
  }

  try {
    const fileStat = await stat(targetPath);
    if (!fileStat.isFile()) {
      return NextResponse.json({ ok: false, message: "Storage asset not found." }, { status: 404 });
    }
    const body = await readFile(targetPath);
    return new Response(body, {
      headers: {
        "Content-Type": getContentType(targetPath),
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Storage asset not found." }, { status: 404 });
  }
}

export function isMockStorageRouteEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") {
    return true;
  }
  return env.ENABLE_MOCK_STORAGE_ROUTE === "true";
}

function getContentType(path: string) {
  if (path.endsWith(".mp4")) {
    return "video/mp4";
  }
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (path.endsWith(".png")) {
    return "image/png";
  }
  if (path.endsWith(".srt")) {
    return "application/x-subrip; charset=utf-8";
  }
  if (path.endsWith(".txt")) {
    return "text/plain; charset=utf-8";
  }
  if (path.endsWith(".csv")) {
    return "text/csv; charset=utf-8";
  }
  if (path.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  return "application/octet-stream";
}
