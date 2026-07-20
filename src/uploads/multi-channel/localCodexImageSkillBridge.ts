import fs from "node:fs/promises";
import path from "node:path";

export type LocalCodexImageSkillDiscovery = {
  image_skill_discovered: boolean;
  image_skill_command: string | null;
  image_skill_output_dir: string;
  image_skill_available: boolean;
  discovery_blocker: string | null;
  evidence: string[];
};

export async function discoverLocalCodexImageSkill(input: { cwd?: string; outputDir?: string } = {}): Promise<LocalCodexImageSkillDiscovery> {
  const cwd = input.cwd ?? process.cwd();
  const outputDir = input.outputDir ?? path.join(cwd, "commerce-assets", "review", "v044", "local-codex-image-skill-output");
  const evidence: string[] = [];

  if (await fileExists(path.join(cwd, "scripts", "uploads", "generate-v035-image-skill-scene-shorts-review-packet.ts"))) {
    evidence.push("v035 image skill review packet references the built-in Codex image generation skill.");
  }
  if (await fileExists(path.join(cwd, "docs", "commerce", "v043_automatic_real_image_provider_orchestrator.md"))) {
    evidence.push("v043 provider registry documents codex_image_skill as the preferred provider.");
  }

  return {
    image_skill_discovered: evidence.length > 0,
    image_skill_command: null,
    image_skill_output_dir: outputDir,
    image_skill_available: false,
    discovery_blocker: evidence.length > 0
      ? "LOCAL_CODEX_IMAGE_SKILL_RUNTIME_COMMAND_NOT_EXPOSED_TO_NODE"
      : "LOCAL_CODEX_IMAGE_SKILL_NOT_FOUND",
    evidence
  };
}

async function fileExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
