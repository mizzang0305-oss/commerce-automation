import { authorizeStudioHost, studioNoStoreJson } from "@/lib/commerce-studio/bridge/hostRoute";

export async function GET(request: Request) {
  const server = await authorizeStudioHost(request, "", "/api/studio-host/commands");
  if (!server) return studioNoStoreJson({ safeError: "STUDIO_HOST_UNAUTHORIZED" }, 401);
  try { return studioNoStoreJson({ commands: await server.bridge.pendingForHost(server.binding.hostId) }); }
  catch { return studioNoStoreJson({ safeError: "STUDIO_COMMAND_READ_FAILED" }, 503); }
}
