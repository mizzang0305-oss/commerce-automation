import "server-only";
import { createClient } from "@supabase/supabase-js";
import { DurableStudioBridge, parseStudioDocument, type StudioCompareSwapStore, type StudioHostBinding } from "./durableStore";

export function studioServerBinding(env: NodeJS.ProcessEnv = process.env): StudioHostBinding | null {
  const environmentId = env.STUDIO_ENVIRONMENT_ID?.trim() || "";
  const ownerId = env.STUDIO_OWNER_GOOGLE_SUB?.trim() || "";
  const hostId = env.STUDIO_HOST_ID?.trim() || "";
  if (!environmentId || !ownerId || !hostId ||
      !(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim() && (env.STUDIO_HOST_HMAC_SECRET?.trim().length ?? 0) >= 32) ||
      !/^[0-9a-f]{40}$/u.test(env.STUDIO_EXPECTED_RUNTIME_SHA?.trim() || "")) return null;
  return { environmentId, ownerId, hostId };
}

export function studioHostSecret() { return process.env.STUDIO_HOST_HMAC_SECRET?.trim() || ""; }

export function createStudioServerBridge() {
  const binding = studioServerBinding();
  if (!binding) return null;
  const client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const store: StudioCompareSwapStore = {
    async read(target) {
      const { data, error } = await client.from("commerce_studio_bridge")
        .select("owner_id,revision,document")
        .eq("environment_id", target.environmentId).eq("host_id", target.hostId).maybeSingle();
      if (error) throw new Error("STUDIO_DURABLE_READ_FAILED");
      if (!data) return null;
      if (data.owner_id !== target.ownerId) throw new Error("STUDIO_HOST_BINDING_MISMATCH");
      if (!Number.isSafeInteger(Number(data.revision)) || Number(data.revision) < 1) throw new Error("STUDIO_DURABLE_REVISION_INVALID");
      return { revision: Number(data.revision), document: parseStudioDocument(data.document) };
    },
    async compareSwap(target, expectedRevision, document) {
      const { data, error } = await client.rpc("commerce_studio_compare_swap", {
        p_environment_id: target.environmentId, p_host_id: target.hostId,
        p_owner_id: target.ownerId, p_expected_revision: expectedRevision,
        p_document: document
      });
      if (error) throw new Error("STUDIO_DURABLE_WRITE_FAILED");
      return data === true;
    }
  };
  return { bridge: new DurableStudioBridge(store, binding), binding };
}
