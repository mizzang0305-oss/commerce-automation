/** Bounded host mailbox adapter. Not scheduled or enabled by this change. */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { readConfiguredSimpleProducerConfig } from "../../src/lib/simple-producer/config";
import { FileSimpleProducerStore } from "../../src/lib/simple-producer/state";
import { studioCommandSchema } from "../../src/lib/commerce-studio/bridge/contracts";
import { signStudioHostRequest } from "../../src/lib/commerce-studio/bridge/hostAuth";
import { applyStudioHostCommand } from "../../src/lib/commerce-studio/plans/apply";
import type { YouTubePublicPublisherState } from "../../src/lib/youtube-public-publisher/publisher";

async function main() {
  if (process.env.STUDIO_HOST_COMMANDS_ENABLED !== "true") throw new Error("STUDIO_HOST_COMMANDS_NOT_ENABLED");
  const origin = process.env.STUDIO_BRIDGE_ORIGIN || "";
  const ownerId = process.env.STUDIO_OWNER_GOOGLE_SUB || "";
  const hostId = process.env.STUDIO_HOST_ID || "";
  const environmentId = process.env.STUDIO_ENVIRONMENT_ID || "";
  const secret = process.env.STUDIO_HOST_HMAC_SECRET || "";
  const publisherPath = process.env.YOUTUBE_PUBLIC_PUBLISHER_STATE_PATH || "";
  if (!/^https:\/\/[^\s/]+$/u.test(origin) || !ownerId || !hostId || !environmentId ||
      secret.length < 32 || !isAbsolute(publisherPath)) throw new Error("STUDIO_HOST_COMMAND_CONFIG_INVALID");
  const configured = await readConfiguredSimpleProducerConfig();
  if (!configured.ok) throw new Error(configured.safeError);
  const response = await signedFetch({ origin, pathname: "/api/studio-host/commands", method: "GET", secret, hostId });
  const list = await response.json() as { commands?: Array<{ command?: unknown }> };
  if (!Array.isArray(list.commands) || list.commands.length > 100) throw new Error("STUDIO_HOST_COMMAND_RESPONSE_INVALID");
  if (!list.commands.length) { console.log(JSON.stringify({ event: "studio_command", result: "NO_OP_NO_PENDING" })); return; }
  const command = studioCommandSchema.parse(list.commands[0].command);
  if (command.ownerId !== ownerId || command.hostId !== hostId || command.environmentId !== environmentId) throw new Error("STUDIO_HOST_BINDING_MISMATCH");
  const publisher = JSON.parse(await readFile(publisherPath, "utf8")) as YouTubePublicPublisherState;
  if (!Array.isArray(publisher.jobs) || !Array.isArray(publisher.ledger)) throw new Error("STUDIO_PUBLISHER_STATE_INVALID");
  const usedProductIds = new Set([...publisher.jobs.map((job) => job.productId), ...publisher.ledger.map((entry) => entry.productId)]);
  const producerStore = new FileSimpleProducerStore(resolve(configured.config.evidenceRoot, "simple-producer-state.json"));
  // No Task settings adapter is wired. Settings requests fail closed; no partial config write.
  const receipt = await applyStudioHostCommand({ command, producerStore, ownerId, hostId, environmentId,
    now: new Date(), usedProductIds });
  if (receipt.status === "pending") throw new Error("STUDIO_HOST_COMMAND_RECONCILE_PENDING");
  const ackPath = `/api/studio-host/commands/${command.commandId}/ack`;
  await signedFetch({ origin, pathname: ackPath, method: "POST", secret, hostId,
    body: JSON.stringify({ status: receipt.status, receipt: receipt.safeError || "STUDIO_HOST_APPLIED",
      appliedRevision: receipt.appliedVersion }) });
  console.log(JSON.stringify({ event: "studio_command", commandId: command.commandId,
    result: receipt.status, safeError: receipt.safeError || null }));
}

async function signedFetch(input: { origin: string; pathname: string; method: "GET" | "POST";
  secret: string; hostId: string; body?: string }) {
  const body = input.body || "";
  const signed = signStudioHostRequest({ secret: input.secret, hostId: input.hostId, method: input.method,
    pathname: input.pathname, body, timestamp: new Date().toISOString(), nonce: randomUUID() });
  const response = await fetch(`${input.origin}${input.pathname}`, { method: input.method, redirect: "manual",
    signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/json",
      "x-studio-host-id": signed.hostId, "x-studio-timestamp": signed.timestamp,
      "x-studio-nonce": signed.nonce, "x-studio-signature": signed.signature },
    body: input.method === "POST" ? body : undefined });
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
    throw new Error("STUDIO_HOST_COMMAND_TRANSPORT_FAILED");
  return response;
}

void main().catch((error: unknown) => {
  const safeError = error instanceof Error && /^STUDIO_[A-Z0-9_]+$/u.test(error.message) ? error.message : "STUDIO_HOST_COMMAND_FAILED";
  console.error(JSON.stringify({ event: "studio_command", safeError }));
  process.exitCode = 2;
});
