import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AutopilotState,
  createDefaultAutopilotState
} from "./autopilot-safety-gates";
import { getAutopilotPaths } from "./read-autopilot-state";

export async function ensureAutopilotDirs(cwd = process.cwd()): Promise<void> {
  const paths = getAutopilotPaths(cwd);
  await fs.mkdir(paths.rootDir, { recursive: true });
  await fs.mkdir(paths.locksDir, { recursive: true });
}

export async function writeAutopilotState(
  cwd = process.cwd(),
  state: AutopilotState = createDefaultAutopilotState()
): Promise<string> {
  await ensureAutopilotDirs(cwd);
  const paths = getAutopilotPaths(cwd);
  await fs.writeFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return paths.statePath;
}

export async function writeJsonArtifact(
  cwd: string,
  relativePath: string,
  value: unknown
): Promise<string> {
  const targetPath = path.join(cwd, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return targetPath;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeAutopilotState()
    .then((statePath) => {
      console.log(JSON.stringify({
        state_written: true,
        state_path: statePath
      }, null, 2));
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
