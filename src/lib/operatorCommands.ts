import { isSafeCopyCommand } from "@/lib/operatorCommandSafety";

export type OperatorCommandType = "navigation" | "copy" | "info";
export type CopyCommandGroup = "Validation" | "Python Worker" | "Targeted Tests" | "Git Safety";

export type NavigationOperatorCommand = {
  id: string;
  type: "navigation";
  label: string;
  description: string;
  href: string;
  aliases: string[];
  defaultFavorite?: boolean;
};

export type CopyOperatorCommand = {
  id: string;
  type: "copy";
  label: string;
  description: string;
  value: string;
  group: CopyCommandGroup;
  aliases: string[];
  defaultFavorite?: boolean;
};

export type InfoOperatorCommand = {
  id: string;
  type: "info";
  label: string;
  description: string;
  aliases: string[];
};

export type OperatorCommand = NavigationOperatorCommand | CopyOperatorCommand | InfoOperatorCommand;

export const navigationCommands: NavigationOperatorCommand[] = [
  { id: "nav.dashboard", type: "navigation", label: "Dashboard", description: "Operator overview and MVP status", href: "/dashboard", aliases: ["home", "overview"], defaultFavorite: true },
  { id: "nav.candidates", type: "navigation", label: "Candidates", description: "Review collected product candidates", href: "/candidates", aliases: ["candidate", "queue seed"] },
  { id: "nav.candidate-analytics", type: "navigation", label: "Candidate Analytics", description: "Analyze seed, scoring, and collector signals", href: "/candidates/analytics", aliases: ["analytics", "seed", "score"], defaultFavorite: true },
  { id: "nav.candidate-seed-plan", type: "navigation", label: "Candidate Seed Plan", description: "Open candidate analytics seed planning section", href: "/candidates/analytics#seed-plan", aliases: ["seed", "planner"] },
  { id: "nav.image-prompts", type: "navigation", label: "Image Prompts", description: "Plan copy-only commerce image prompts for candidates", href: "/image-prompts", aliases: ["image", "prompt", "asset plan"] },
  { id: "nav.artifacts", type: "navigation", label: "Artifacts", description: "Manual QA for video, thumbnail, subtitle, and package artifacts", href: "/artifacts", aliases: ["artifact qa", "qa", "review"], defaultFavorite: true },
  { id: "nav.production-readiness", type: "navigation", label: "Production Readiness", description: "Readiness checks without running deploys", href: "/ops/production-readiness", aliases: ["preflight", "env", "production"], defaultFavorite: true },
  { id: "nav.runs", type: "navigation", label: "Runs", description: "Inspect automation run history", href: "/runs", aliases: ["history"] },
  { id: "nav.jobs", type: "navigation", label: "Jobs", description: "Inspect worker job queue state", href: "/jobs", aliases: ["worker", "queue"] },
  { id: "nav.settings", type: "navigation", label: "Settings", description: "Review safe settings and upload-disabled defaults", href: "/settings", aliases: ["config", "upload disabled"] },
  { id: "nav.dev-test-lab", type: "navigation", label: "Dev/Test Lab", description: "Development-only smoke workflow panel", href: "/dev/test-lab", aliases: ["test lab", "smoke"] }
];

const rawCopyCommands: CopyOperatorCommand[] = [
  { id: "copy.check.mojibake", type: "copy", group: "Validation", label: "Copy mojibake check", description: "Copy safe text for UTF-8 source scan", value: "npm run check:mojibake", aliases: ["utf8", "korean"] },
  { id: "copy.check.production-env", type: "copy", group: "Validation", label: "Copy production env check", description: "Copy safe text for local production env readiness report", value: "npm run check:production-env", aliases: ["env", "production"], defaultFavorite: true },
  { id: "copy.preflight.production-pilot", type: "copy", group: "Validation", label: "Copy production pilot preflight", description: "Copy safe text for approval-gated pilot preflight", value: "npm run preflight:production-pilot", aliases: ["preflight", "pilot"] },
  { id: "copy.test.full", type: "copy", group: "Validation", label: "Copy npm run test", description: "Copy full Vitest command", value: "npm run test", aliases: ["test", "full validation"], defaultFavorite: true },
  { id: "copy.lint", type: "copy", group: "Validation", label: "Copy npm run lint", description: "Copy lint command", value: "npm run lint", aliases: ["lint"] },
  { id: "copy.build", type: "copy", group: "Validation", label: "Copy npm run build", description: "Copy build command", value: "npm run build", aliases: ["build"] },
  {
    id: "copy.python.path",
    type: "copy",
    group: "Python Worker",
    label: "Copy Python 3.12 PATH setup",
    description: "Copy PowerShell session setup for worker validation only",
    value: '$env:Path = "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\python-worker\\.venv\\Scripts;$env:Path"\npython --version\npython -m unittest discover python-worker/tests',
    aliases: ["worker", "python", "venv"]
  },
  { id: "copy.python.version", type: "copy", group: "Python Worker", label: "Copy Python version check", description: "Copy Python runtime check", value: "python --version", aliases: ["worker", "python"] },
  { id: "copy.python.unittest", type: "copy", group: "Python Worker", label: "Copy Python worker unittest", description: "Copy worker test command without starting the worker", value: "python -m unittest discover python-worker/tests", aliases: ["worker", "python", "test"] },
  { id: "copy.python.compileall", type: "copy", group: "Python Worker", label: "Copy Python compileall", description: "Copy compile check command", value: "python -m compileall python-worker", aliases: ["worker", "python", "compile"] },
  { id: "copy.test.candidates", type: "copy", group: "Targeted Tests", label: "Copy candidates test", description: "Copy candidate test subset", value: "npm run test -- candidates", aliases: ["candidate", "test"] },
  { id: "copy.test.artifacts", type: "copy", group: "Targeted Tests", label: "Copy artifact QA test command", description: "Copy artifact QA test subset", value: "npm run test -- artifacts", aliases: ["artifact", "qa", "test"] },
  { id: "copy.test.dashboard", type: "copy", group: "Targeted Tests", label: "Copy dashboard test", description: "Copy dashboard test subset", value: "npm run test -- dashboard", aliases: ["dashboard", "test"] },
  { id: "copy.test.production", type: "copy", group: "Targeted Tests", label: "Copy production test", description: "Copy production guard test subset", value: "npm run test -- production", aliases: ["production", "test"] },
  { id: "copy.test.palette", type: "copy", group: "Targeted Tests", label: "Copy command palette test", description: "Copy operator command palette test", value: "npm run test -- tests/operator-command-palette.test.tsx", aliases: ["palette", "test"] },
  { id: "copy.git.status", type: "copy", group: "Git Safety", label: "Copy git status", description: "Copy clean working tree check", value: "git status --short", aliases: ["git", "status"] },
  { id: "copy.git.diff-check", type: "copy", group: "Git Safety", label: "Copy git diff check", description: "Copy whitespace check", value: "git diff --check", aliases: ["git", "diff"] },
  { id: "copy.git.cached-diff-check", type: "copy", group: "Git Safety", label: "Copy staged diff check", description: "Copy staged whitespace check", value: "git diff --cached --check", aliases: ["git", "staged"] }
];

export const copyCommands = rawCopyCommands.filter((command) => isSafeCopyCommand(command.value));

export const safetyInfoCommands: InfoOperatorCommand[] = [
  { id: "info.boundaries", type: "info", label: "Current safety boundaries", description: "Navigation and copy-only commands; no execution side effects.", aliases: ["safety"] },
  { id: "info.production-pilot", type: "info", label: "Production pilot remains approval-gated", description: "Production pilot checks are copied or viewed only.", aliases: ["production", "preflight"] },
  { id: "info.candidate-only", type: "info", label: "Candidate-only collector never creates queue rows", description: "Collector execution gates remain candidate-only.", aliases: ["candidate", "collector"] },
  { id: "info.artifact-qa", type: "info", label: "Artifact QA changes review status only and never uploads", description: "Artifact QA does not trigger upload or worker jobs.", aliases: ["artifact", "qa", "upload"] }
];

export const operatorCommands: OperatorCommand[] = [...navigationCommands, ...copyCommands, ...safetyInfoCommands];

export const defaultFavoriteCommandIds = operatorCommands
  .filter((command): command is NavigationOperatorCommand | CopyOperatorCommand => "defaultFavorite" in command && Boolean(command.defaultFavorite))
  .map((command) => command.id);

const contextCommandIdsByPath: Array<{ match: (pathname: string) => boolean; ids: string[] }> = [
  { match: (pathname) => pathname === "/dashboard" || pathname === "/", ids: ["nav.production-readiness", "nav.candidate-analytics", "copy.test.full"] },
  { match: (pathname) => pathname.startsWith("/candidates/analytics"), ids: ["nav.candidate-seed-plan", "nav.image-prompts", "copy.test.candidates", "nav.candidates"] },
  { match: (pathname) => pathname.startsWith("/image-prompts"), ids: ["nav.candidates", "nav.candidate-analytics", "copy.test.candidates"] },
  { match: (pathname) => pathname.startsWith("/artifacts"), ids: ["nav.artifacts.pending", "nav.artifacts.needs-fix", "copy.test.artifacts"] },
  { match: (pathname) => pathname.startsWith("/ops/production-readiness"), ids: ["copy.preflight.production-pilot", "copy.check.production-env", "nav.production-readiness"] }
];

export const contextOnlyCommands: NavigationOperatorCommand[] = [
  { id: "nav.artifacts.pending", type: "navigation", label: "Open Pending Review Queue", description: "Open artifact QA filtered to pending review", href: "/artifacts?qa_status=pending", aliases: ["qa", "pending", "artifact"] },
  { id: "nav.artifacts.needs-fix", type: "navigation", label: "Open Needs Fix Queue", description: "Open artifact QA filtered to needs-fix review", href: "/artifacts?qa_status=needs_fix", aliases: ["qa", "fix", "artifact"] }
];

export function getCommandById(id: string) {
  return [...operatorCommands, ...contextOnlyCommands].find((command) => command.id === id);
}

export function getContextCommands(pathname: string) {
  const ids = contextCommandIdsByPath.find((entry) => entry.match(pathname))?.ids ?? [];
  return ids.map(getCommandById).filter((command): command is OperatorCommand | NavigationOperatorCommand => Boolean(command));
}

export function getSearchValue(command: OperatorCommand | NavigationOperatorCommand) {
  const copyValue = command.type === "copy" ? command.value : "";
  return [command.label, command.description, ...command.aliases, copyValue].join(" ");
}
