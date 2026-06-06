import type { OperatorCommandType } from "@/lib/operatorCommands";

export const recentCommandsStorageKey = "commerce.operatorCommandPalette.recent";
export const favoriteCommandsStorageKey = "commerce.operatorCommandPalette.favorites";

export type RecentCommand = {
  id: string;
  label: string;
  type: Extract<OperatorCommandType, "navigation" | "copy">;
  used_at: string;
};

function readJsonArray<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readRecentCommands() {
  return readJsonArray<RecentCommand>(recentCommandsStorageKey).filter((command) => {
    return typeof command.id === "string" && typeof command.label === "string" && (command.type === "navigation" || command.type === "copy");
  });
}

export function writeRecentCommand(command: RecentCommand, limit = 10) {
  const current = readRecentCommands().filter((recent) => recent.id !== command.id);
  const next = [command, ...current].slice(0, limit);
  writeJsonArray(recentCommandsStorageKey, next);
  return next;
}

export function readFavoriteCommandIds(defaultIds: string[]) {
  const stored = readJsonArray<string>(favoriteCommandsStorageKey).filter((id) => typeof id === "string");
  return stored.length > 0 ? stored : defaultIds;
}

export function writeFavoriteCommandIds(ids: string[]) {
  const safeIds = Array.from(new Set(ids.filter((id) => typeof id === "string" && !/SECRET|npm run/i.test(id))));
  writeJsonArray(favoriteCommandsStorageKey, safeIds);
  return safeIds;
}
