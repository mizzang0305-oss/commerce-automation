import "server-only";
import { createStudioServerBridge, studioHostSecret } from "./serverStore";
import { verifyStudioHostRequest } from "./hostAuth";

export async function authorizeStudioHost(request: Request, body: string, pathname: string) {
  const server = createStudioServerBridge();
  if (!server) return null;
  const headers = {
    hostId: request.headers.get("x-studio-host-id") || "",
    timestamp: request.headers.get("x-studio-timestamp") || "",
    nonce: request.headers.get("x-studio-nonce") || "",
    signature: request.headers.get("x-studio-signature") || ""
  };
  if (!verifyStudioHostRequest({ secret: studioHostSecret(), expectedHostId: server.binding.hostId,
    method: request.method, pathname, body, headers })) return null;
  if (!await server.bridge.useNonce(server.binding.hostId, headers.nonce)) return null;
  return server;
}

export function studioNoStoreJson(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
}
