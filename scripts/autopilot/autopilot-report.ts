import fs from "node:fs/promises";
import path from "node:path";

import type { AutopilotState } from "./autopilot-safety-gates";
import type { AutopilotDecision } from "./decide-next-action";
import { ensureAutopilotDirs } from "./write-autopilot-state";
import { getAutopilotPaths } from "./read-autopilot-state";

export type AutopilotEvent = {
  event_type: string;
  phase?: string | null;
  next_action?: string | null;
  blocked_reasons?: string[];
  [key: string]: unknown;
};

export function renderAutopilotReport(input: {
  state: AutopilotState;
  decision: AutopilotDecision | {
    phase: string;
    nextAction?: string | null;
    shouldStop: boolean;
    privateUploadAttempted: boolean;
    videosInsertAllowed: boolean;
    blockedReasons?: string[];
  };
}): string {
  const blockedReasons = input.decision.blockedReasons ?? [];
  return [
    "# Commerce Automation Hourly Autopilot Report",
    "",
    `- generated_at: ${new Date().toISOString()}`,
    `- current_phase: ${input.decision.phase}`,
    `- current_candidate_id: ${input.state.current_candidate_id}`,
    `- current_review_version: ${input.state.current_review_version}`,
    `- latest_human_review_status: ${input.state.latest_human_review_status}`,
    `- next_recommended_action: ${input.decision.nextAction ?? input.state.next_recommended_action ?? "null"}`,
    `- private_upload_allowed: ${input.state.private_upload_allowed}`,
    `- private_upload_attempted: ${input.decision.privateUploadAttempted}`,
    `- videos_insert_allowed: ${input.decision.videosInsertAllowed}`,
    `- public_upload_blocked: ${input.state.public_upload_blocked}`,
    `- unlisted_upload_blocked: ${input.state.unlisted_upload_blocked}`,
    `- blocked_reasons: ${blockedReasons.length ? blockedReasons.join(", ") : "[]"}`,
    "",
    "## Safety",
    "",
    "- YouTube Execute: NO",
    "- videos.insert: NO",
    "- R2 upload/write: NO",
    "- product_assets write: NO",
    "- public upload: NO",
    "- unlisted upload: NO",
    "- secrets/raw URLs printed: NO",
    ""
  ].join("\n");
}

export async function writeAutopilotReport(input: {
  cwd: string;
  state: AutopilotState;
  decision: AutopilotDecision;
}): Promise<string> {
  await ensureAutopilotDirs(input.cwd);
  const paths = getAutopilotPaths(input.cwd);
  await fs.writeFile(paths.reportPath, renderAutopilotReport(input), "utf8");
  return paths.reportPath;
}

export async function appendAutopilotEvent(cwd: string, event: AutopilotEvent): Promise<string> {
  await ensureAutopilotDirs(cwd);
  const paths = getAutopilotPaths(cwd);
  const safeEvent = {
    timestamp: new Date().toISOString(),
    ...event
  };
  await fs.mkdir(path.dirname(paths.eventsPath), { recursive: true });
  await fs.appendFile(paths.eventsPath, `${JSON.stringify(safeEvent)}\n`, "utf8");
  return paths.eventsPath;
}
