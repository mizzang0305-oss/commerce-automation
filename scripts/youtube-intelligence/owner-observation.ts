import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildOwnerObservationRequirementsReport,
  validateCompletedOwnerObservationPacket,
  type EditableOwnerObservationPacket,
} from "../../src/lib/video-lab/youtube-intelligence";

const NETWORK_ACCOUNTING = {
  youtubeRequests: 0,
  metadata: 0,
  timedtext: 0,
  captions: 0,
  ytDlp: 0,
  cookies: 0,
  video: 0,
  audio: 0,
  llm: 0,
  vision: 0,
  mcp: 0,
} as const;

async function main() {
  const command = process.argv[2];
  if (command !== "validate" && command !== "report") throw new Error("OWNER_OBSERVATION_COMMAND_REQUIRED");
  const defaultPath = resolve("docs", "youtube-intelligence", "owner-observations", "EXACT_FIVE_OWNER_OBSERVATION_PACKETS.json");
  const inputPath = resolve(optionalArg("--input") || defaultPath);
  const parsed = JSON.parse(await readFile(inputPath, "utf8")) as unknown;
  const packets = extractPackets(parsed);
  if (command === "report") {
    const report = buildOwnerObservationRequirementsReport({ packets: packets as unknown as Record<string, unknown>[] });
    process.stdout.write(`${JSON.stringify({ command, report, networkAccounting: NETWORK_ACCOUNTING, productionRankingAllowed: false })}\n`);
    return;
  }
  if (packets.length === 0) throw new Error("OWNER_OBSERVATION_PACKETS_REQUIRED");
  const validated = packets.map(validateCompletedOwnerObservationPacket);
  process.stdout.write(`${JSON.stringify({ command, validated: validated.length, statuses: validated.map((packet) => ({ videoId: packet.videoId, status: packet.status })), rawMediaReuseAllowed: false, networkAccounting: NETWORK_ACCOUNTING, productionRankingAllowed: false })}\n`);
}

function extractPackets(value: unknown): EditableOwnerObservationPacket[] {
  if (Array.isArray(value)) return value as EditableOwnerObservationPacket[];
  if (typeof value === "object" && value !== null && Array.isArray((value as { packets?: unknown }).packets)) return (value as { packets: EditableOwnerObservationPacket[] }).packets;
  if (typeof value === "object" && value !== null) return [value as EditableOwnerObservationPacket];
  return [];
}
function optionalArg(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] ?? "" : ""; }
function safeError(error: unknown) { const value = error instanceof Error ? error.message : String(error); return /^[A-Z0-9_:-]+$/u.test(value) ? value : "OWNER_OBSERVATION_VALIDATION_FAILED"; }
void main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ event: "owner_observation_failed", safeError: safeError(error), networkAccounting: NETWORK_ACCOUNTING, productionRankingAllowed: false })}\n`);
  process.exitCode = 1;
});
