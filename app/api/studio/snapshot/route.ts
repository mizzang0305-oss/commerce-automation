import { readStudioOwner } from "@/lib/commerce-studio/auth/server";
import { createStudioServerBridge } from "@/lib/commerce-studio/bridge/serverStore";
import { studioModelFromSnapshot } from "@/lib/commerce-studio/bridge/snapshotModel";
import { studioNoStoreJson } from "@/lib/commerce-studio/bridge/hostRoute";

export async function GET() {
  const owner = await readStudioOwner();
  if (!owner) return studioNoStoreJson({ safeError: "STUDIO_OWNER_UNAUTHORIZED" }, 401);
  const server = createStudioServerBridge();
  if (!server) return studioNoStoreJson({ safeError: "STUDIO_BRIDGE_NOT_CONFIGURED" }, 503);
  if (owner.ownerId !== server.binding.ownerId) return studioNoStoreJson({ safeError: "STUDIO_OWNER_FORBIDDEN" }, 403);
  try { return studioNoStoreJson(studioModelFromSnapshot(await server.bridge.read(owner.ownerId), new Date(), process.env.STUDIO_COMMANDS_ENABLED === "true")); }
  catch { return studioNoStoreJson({ safeError: "STUDIO_DURABLE_READ_FAILED" }, 503); }
}
