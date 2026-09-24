import { z } from "zod";
import { readStudioOwner } from "@/lib/commerce-studio/auth/server";
import { sameStudioOrigin, studioAuthConfig } from "@/lib/commerce-studio/auth/config";
import { createStudioServerBridge } from "@/lib/commerce-studio/bridge/serverStore";
import { studioNoStoreJson } from "@/lib/commerce-studio/bridge/hostRoute";
import { studioSettingsInputSchema } from "@/lib/commerce-studio/bridge/contracts";
import { STUDIO_CANDIDATE_MAX_AGE_MS } from "@/lib/commerce-studio/candidates/policy";

const requestSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("SET_PRODUCER_SETTINGS"), targetId: z.literal("producer-settings"), expectedVersion: z.number().int().nonnegative(), payload: studioSettingsInputSchema }),
  z.strictObject({ type: z.literal("SELECT_PRODUCT"), targetId: z.string().regex(/^\d{4}-\d{2}-\d{2}\|(?:0\d|1\d|2[01]):[0-5]\d$/u), expectedVersion: z.number().int().nonnegative(),
    payload: z.strictObject({ candidateSnapshotId: z.string().min(1), productId: z.string().min(1) }) }),
  z.strictObject({ type: z.literal("HOLD_PLAN"), targetId: z.string().regex(/^\d{4}-\d{2}-\d{2}\|(?:0\d|1\d|2[01]):[0-5]\d$/u), expectedVersion: z.number().int().nonnegative(), payload: z.strictObject({}) })
]);

export async function POST(request: Request) {
  if (!sameStudioOrigin(request, studioAuthConfig().origin)) return studioNoStoreJson({ safeError: "STUDIO_ORIGIN_FORBIDDEN" }, 403);
  const owner = await readStudioOwner();
  if (!owner) return studioNoStoreJson({ safeError: "STUDIO_OWNER_UNAUTHORIZED" }, 401);
  const server = createStudioServerBridge();
  if (!server || process.env.STUDIO_COMMANDS_ENABLED !== "true") return studioNoStoreJson({ safeError: "STUDIO_COMMANDS_NOT_ENABLED" }, 503);
  if (owner.ownerId !== server.binding.ownerId) return studioNoStoreJson({ safeError: "STUDIO_OWNER_FORBIDDEN" }, 403);
  const body = await request.text();
  if (body.length > 4096) return studioNoStoreJson({ safeError: "STUDIO_COMMAND_TOO_LARGE" }, 413);
  let raw: unknown;
  try { raw = JSON.parse(body); } catch { return studioNoStoreJson({ safeError: "STUDIO_COMMAND_JSON_INVALID" }, 400); }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) return studioNoStoreJson({ safeError: "STUDIO_COMMAND_INVALID" }, 400);
  const commandId = request.headers.get("x-studio-idempotency-key") || "";
  if (!z.uuid().safeParse(commandId).success) return studioNoStoreJson({ safeError: "STUDIO_IDEMPOTENCY_KEY_INVALID" }, 400);
  const now = new Date();
  try {
    const existing = await server.bridge.command(owner.ownerId, commandId);
    if (existing) {
      const intended = parsed.data;
      if (existing.command.type !== intended.type || existing.command.targetId !== intended.targetId ||
          existing.command.expectedVersion !== intended.expectedVersion ||
          JSON.stringify(existing.command.payload) !== JSON.stringify(intended.payload))
        return studioNoStoreJson({ safeError: "STUDIO_COMMAND_ID_COLLISION" }, 409);
      return studioNoStoreJson({ commandId, status: existing.status }, 202);
    }
  } catch { return studioNoStoreJson({ safeError: "STUDIO_COMMAND_READ_FAILED" }, 503); }
  let snapshot;
  try { snapshot = await server.bridge.read(owner.ownerId); }
  catch { return studioNoStoreJson({ safeError: "STUDIO_DURABLE_READ_FAILED" }, 503); }
  if (!snapshot || now.getTime() - Date.parse(snapshot.receivedAt) > 180_000 ||
      now.getTime() - Date.parse(snapshot.envelope.observedAt) > 180_000)
    return studioNoStoreJson({ safeError: "STUDIO_HOST_SNAPSHOT_STALE" }, 409);
  if (parsed.data.type === "SELECT_PRODUCT") {
    const selection = parsed.data;
    const candidateObservedAt = snapshot.sourceObservedAt?.candidates ??
      (snapshot.envelope.completeness.candidates ? snapshot.envelope.observedAt : null);
    if (!candidateObservedAt || !Number.isFinite(Date.parse(candidateObservedAt)) ||
        now.getTime() - Date.parse(candidateObservedAt) >= STUDIO_CANDIDATE_MAX_AGE_MS ||
        Date.parse(candidateObservedAt) > now.getTime())
      return studioNoStoreJson({ safeError: "STUDIO_CANDIDATE_SOURCE_STALE" }, 409);
    const candidate = snapshot.payload.candidates?.find((item) => item.snapshotId === selection.payload.candidateSnapshotId &&
      item.productId === selection.payload.productId && item.slotId === selection.targetId);
    if (!candidate?.eligible || candidate.safeBlockers.length) return studioNoStoreJson({ safeError: "STUDIO_CANDIDATE_NOT_ELIGIBLE" }, 409);
  }
  if (parsed.data.type === "SET_PRODUCER_SETTINGS" && snapshot.payload.producer?.settings.revision !== parsed.data.expectedVersion)
    return studioNoStoreJson({ safeError: "STUDIO_SETTINGS_VERSION_STALE" }, 409);
  const command = { ...parsed.data, commandId, ...server.binding,
    requestedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 300_000).toISOString() };
  try {
    const entry = await server.bridge.enqueue(command, owner.ownerId, now);
    return studioNoStoreJson({ commandId: entry.command.commandId, status: entry.status }, 202);
  } catch { return studioNoStoreJson({ safeError: "STUDIO_COMMAND_REJECTED" }, 409); }
}

export async function GET(request: Request) {
  const owner = await readStudioOwner();
  if (!owner) return studioNoStoreJson({ safeError: "STUDIO_OWNER_UNAUTHORIZED" }, 401);
  const server = createStudioServerBridge();
  if (!server) return studioNoStoreJson({ safeError: "STUDIO_BRIDGE_NOT_CONFIGURED" }, 503);
  if (owner.ownerId !== server.binding.ownerId) return studioNoStoreJson({ safeError: "STUDIO_OWNER_FORBIDDEN" }, 403);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!z.uuid().safeParse(id).success) return studioNoStoreJson({ safeError: "STUDIO_COMMAND_ID_INVALID" }, 400);
  try { return studioNoStoreJson({ command: await server.bridge.command(owner.ownerId, id) }); }
  catch { return studioNoStoreJson({ safeError: "STUDIO_COMMAND_READ_FAILED" }, 503); }
}
