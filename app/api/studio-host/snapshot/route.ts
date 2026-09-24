import { authorizeStudioHost, studioNoStoreJson } from "@/lib/commerce-studio/bridge/hostRoute";
import { snapshotEnvelopeSchema } from "@/lib/commerce-studio/bridge/contracts";
import { createHash } from "node:crypto";

export async function POST(request: Request) {
  const body = await request.text();
  if (body.length > 1_000_000) return studioNoStoreJson({ safeError: "STUDIO_SNAPSHOT_TOO_LARGE" }, 413);
  const server = await authorizeStudioHost(request, body, "/api/studio-host/snapshot");
  if (!server) return studioNoStoreJson({ safeError: "STUDIO_HOST_UNAUTHORIZED" }, 401);
  try {
    const raw = JSON.parse(body);
    const envelope = snapshotEnvelopeSchema.parse(raw);
    if (envelope.sourceRuntimeSha !== process.env.STUDIO_EXPECTED_RUNTIME_SHA) return studioNoStoreJson({ safeError: "STUDIO_RUNTIME_SHA_MISMATCH" }, 409);
    if (Date.parse(envelope.observedAt) > Date.now() + 300_000 ||
        envelope.sourceRevision !== createHash("sha256").update(JSON.stringify(raw.payload)).digest("hex"))
      return studioNoStoreJson({ safeError: "STUDIO_SOURCE_REVISION_INVALID" }, 409);
    const status = await server.bridge.ingest(envelope);
    return studioNoStoreJson({ status });
  } catch {
    return studioNoStoreJson({ safeError: "STUDIO_SNAPSHOT_REJECTED" }, 409);
  }
}
