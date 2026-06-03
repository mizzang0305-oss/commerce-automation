#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_PATHS = ["app", "src", "docs", "checklists", "python-worker", "tests", "README.md"];
const SKIP_DIRS = new Set([
  ".git",
  ".next",
  ".venv",
  "node_modules",
  "data",
  "outputs",
  "temp",
  "logs",
  ".playwright-mcp"
]);
const TEXT_EXTENSIONS = new Set([".md", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".py", ".txt", ".json", ".sql"]);
const MOJIBAKE_PATTERN = /[\u00ec\u00eb\u00ea\u00ed\u00e2\uFFFD\u5360]|\p{Script=Han}/u;

function parseArgs(argv) {
  const paths = [];
  const allowlist = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--paths") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--paths requires a comma-separated path list.");
      }
      paths.push(...next.split(",").map((entry) => entry.trim()).filter(Boolean));
      index += 1;
      continue;
    }
    if (arg === "--allowlist") {
      const next = argv[index + 1];
      if (!next) {
        throw new Error("--allowlist requires a comma-separated list.");
      }
      allowlist.push(...next.split(",").map((entry) => entry.trim()).filter(Boolean));
      index += 1;
      continue;
    }
  }

  return {
    paths: paths.length > 0 ? paths : DEFAULT_PATHS,
    allowlist
  };
}

function collectFiles(entry, files = []) {
  if (!existsSync(entry)) {
    return files;
  }

  const stats = readdirSafe(entry);
  if (!stats) {
    if (TEXT_EXTENSIONS.has(path.extname(entry))) {
      files.push(entry);
    }
    return files;
  }

  for (const child of stats) {
    if (child.isDirectory()) {
      if (!SKIP_DIRS.has(child.name)) {
        collectFiles(path.join(entry, child.name), files);
      }
      continue;
    }
    if (child.isFile() && TEXT_EXTENSIONS.has(path.extname(child.name))) {
      files.push(path.join(entry, child.name));
    }
  }

  return files;
}

function readdirSafe(entry) {
  try {
    return readdirSync(entry, { withFileTypes: true });
  } catch {
    return null;
  }
}

function isAllowed(line, allowlist) {
  return allowlist.some((allowed) => allowed && line.includes(allowed));
}

function scan(files, allowlist) {
  const matches = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (MOJIBAKE_PATTERN.test(line) && !isAllowed(line, allowlist)) {
        matches.push({
          file,
          line: index + 1,
          snippet: line.trim().slice(0, 160)
        });
      }
    });
  }

  return matches;
}

try {
  const { paths, allowlist } = parseArgs(process.argv.slice(2));
  const files = [...new Set(paths.flatMap((entry) => collectFiles(entry)))].sort();
  const matches = scan(files, allowlist);

  for (const match of matches) {
    console.log(`${match.file}:${match.line}: ${match.snippet}`);
  }

  console.log(`files_scanned=${files.length}`);
  console.log(`mojibake_matches=${matches.length}`);

  process.exitCode = matches.length > 0 ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
