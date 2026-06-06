const forbiddenCopyPatterns = [
  ...[
    ["SUPABASE", "SERVICE", "ROLE", "KEY"],
    ["R2", "SECRET"],
    ["R2", "SECRET", "ACCESS", "KEY"],
    ["R2", "ACCESS", "KEY", "ID"],
    ["OPENAI", "API", "KEY"],
    ["GEMINI", "API", "KEY"],
    ["COUPANG", "SECRET", "KEY"],
    ["WORKER", "API", "SECRET"],
    ["COMMERCE", "AUTOMATION", "API", "SECRET"]
  ].map((parts) => new RegExp(parts.join("_"), "i")),
  new RegExp(["Author", "ization:\\s*", "Bear", "er"].join(""), "i"),
  new RegExp(["vercel", "\\s+", "deploy"].join(""), "i"),
  new RegExp(["vercel", "\\s+", "--prod"].join(""), "i"),
  new RegExp(["supabase", "\\s+", "db", "\\s+", "push"].join(""), "i"),
  new RegExp(["supabase", "\\s+", "migration", "\\s+", "up"].join(""), "i"),
  new RegExp(["videos", "\\.", "insert"].join(""), "i"),
  /youtube_upload_enabled\s*=\s*true/i,
  /upload_enabled\s*=\s*true/i,
  /public_upload_enabled\s*=\s*true/i,
  /python-worker[\\/]+worker\.py/i,
  /python\s+worker\.py/i,
  /\.env\.local/i,
  /python-worker[\\/]+\.env/i
];

export function isSafeCopyCommand(value: string) {
  return forbiddenCopyPatterns.every((pattern) => !pattern.test(value));
}
