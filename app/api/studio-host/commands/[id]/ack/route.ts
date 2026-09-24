import { z } from "zod";
import { authorizeStudioHost, studioNoStoreJson } from "@/lib/commerce-studio/bridge/hostRoute";

const ackSchema = z.strictObject({ status: z.enum(["applied", "rejected"]),
  receipt: z.string().min(1).max(160), appliedRevision: z.number().int().nonnegative().nullable() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!z.uuid().safeParse(id).success) return studioNoStoreJson({ safeError: "STUDIO_COMMAND_ID_INVALID" }, 400);
  const body = await request.text();
  if (body.length > 2048) return studioNoStoreJson({ safeError: "STUDIO_ACK_TOO_LARGE" }, 413);
  const server = await authorizeStudioHost(request, body, `/api/studio-host/commands/${id}/ack`);
  if (!server) return studioNoStoreJson({ safeError: "STUDIO_HOST_UNAUTHORIZED" }, 401);
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return studioNoStoreJson({ safeError: "STUDIO_ACK_JSON_INVALID" }, 400); }
  const parsed = ackSchema.safeParse(raw);
  if (!parsed.success) return studioNoStoreJson({ safeError: "STUDIO_ACK_INVALID" }, 400);
  try { return studioNoStoreJson({ command: await server.bridge.acknowledge(server.binding.hostId, id, parsed.data) }); }
  catch { return studioNoStoreJson({ safeError: "STUDIO_ACK_REJECTED" }, 409); }
}
