"use client";

import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { ClipboardCopy, Compass, Info, Search, Star } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  copyCommands,
  defaultFavoriteCommandIds,
  getCommandById,
  getContextCommands,
  getSearchValue,
  navigationCommands,
  safetyInfoCommands,
  type CopyCommandGroup,
  type CopyOperatorCommand,
  type NavigationOperatorCommand,
  type OperatorCommand
} from "@/lib/operatorCommands";
import { readFavoriteCommandIds, readRecentCommands, writeFavoriteCommandIds, writeRecentCommand, type RecentCommand } from "@/lib/operatorCommandStorage";

const safetyNotice = "Command Palette\ub294 \ud398\uc774\uc9c0 \uc774\ub3d9\uacfc \uc548\uc804\ud55c \uba85\ub839\uc5b4 \ubcf5\uc0ac\ub9cc \uc9c0\uc6d0\ud569\ub2c8\ub2e4.";
const safetyBoundary = "Worker \uc2e4\ud589, production deploy, DB write, platform upload\ub294 \uc2e4\ud589\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.";
const safetyDisclosure = "Copied commands are not executed automatically. Secrets, env files, auth headers, worker starts, deploys, DB writes, and platform uploads are not copied.";
const copyGroups: CopyCommandGroup[] = ["Validation", "Python Worker", "Targeted Tests", "Git Safety"];

function commandIcon(command: OperatorCommand | NavigationOperatorCommand) {
  if (command.type === "copy") {
    return <ClipboardCopy size={16} className="text-slate-500" aria-hidden="true" />;
  }
  if (command.type === "info") {
    return <Info size={16} className="text-slate-500" aria-hidden="true" />;
  }
  return <Compass size={16} className="text-teal-700" aria-hidden="true" />;
}

export function OperatorCommandPalette() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [recentCommands, setRecentCommands] = useState<RecentCommand[]>(() => readRecentCommands());
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavoriteCommandIds(defaultFavoriteCommandIds));

  const favoriteCommands = useMemo(() => {
    return favoriteIds.map(getCommandById).filter((command): command is OperatorCommand | NavigationOperatorCommand => Boolean(command));
  }, [favoriteIds]);

  const contextCommands = useMemo(() => getContextCommands(pathname), [pathname]);

  const shortcutLabel = useMemo(() => {
    if (typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac")) {
      return "Cmd K";
    }
    return "Ctrl K";
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
        return;
      }

      if (open && event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        setMessage("");
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  function recordRecent(command: NavigationOperatorCommand | CopyOperatorCommand) {
    const next = writeRecentCommand({
      id: command.id,
      label: command.label,
      type: command.type,
      used_at: new Date().toISOString()
    });
    setRecentCommands(next);
  }

  function navigate(command: NavigationOperatorCommand) {
    recordRecent(command);
    router.push(command.href);
    setMessage("");
    setOpen(false);
  }

  async function copyText(command: CopyOperatorCommand) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(command.value).catch(() => undefined);
    }
    recordRecent(command);
    setMessage("Copied safe command text. No command was executed.");
  }

  function toggleFavorite(command: OperatorCommand | NavigationOperatorCommand) {
    const next = favoriteIds.includes(command.id) ? favoriteIds.filter((id) => id !== command.id) : [...favoriteIds, command.id];
    setFavoriteIds(writeFavoriteCommandIds(next));
    setMessage(`${command.label} favorite ${next.includes(command.id) ? "added" : "removed"}. No command was executed.`);
  }

  function selectCommand(command: OperatorCommand | NavigationOperatorCommand) {
    if (command.type === "navigation") {
      navigate(command);
      return;
    }
    if (command.type === "copy") {
      void copyText(command);
      return;
    }
    setMessage("Read-only safety information. No command was executed.");
  }

  function renderCommandItem(command: OperatorCommand | NavigationOperatorCommand, options?: { badges?: boolean }) {
    const isFavorite = favoriteIds.includes(command.id);
    return (
      <Command.Item
        key={command.id}
        value={getSearchValue(command)}
        onSelect={() => selectCommand(command)}
        className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100"
      >
        {commandIcon(command)}
        <span className="min-w-0 flex-1">
          <span className="block font-bold text-slate-950">{command.label}</span>
          <span className="block text-xs text-slate-500">{command.description}</span>
        </span>
        {options?.badges && command.type === "copy" ? (
          <>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">Copy only</span>
            <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold uppercase text-orange-700">No execution</span>
          </>
        ) : null}
        {command.type !== "info" ? (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleFavorite(command);
            }}
            className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold uppercase text-slate-500 hover:bg-slate-100"
            aria-label={`${isFavorite ? "Unfavorite" : "Favorite"} ${command.label}`}
          >
            <Star size={12} fill={isFavorite ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        ) : null}
      </Command.Item>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100"
        aria-label="Open command palette"
      >
        <Search size={14} aria-hidden="true" />
        Command
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{shortcutLabel}</span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/30 px-3 py-16" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="operator-command-palette-title"
            aria-describedby="operator-command-palette-description"
            className="mx-auto w-[min(780px,100%)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
          >
            <Command label="Operator command palette">
              <div className="border-b border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <Search size={18} className="text-slate-400" aria-hidden="true" />
                  <Command.Input
                    autoFocus
                    placeholder="Search operator commands..."
                    className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </div>
                <h2 id="operator-command-palette-title" className="sr-only">
                  Operator command palette
                </h2>
                <p id="operator-command-palette-description" className="mt-3 text-xs font-semibold text-slate-500">
                  {safetyNotice}
                </p>
                <p className="mt-1 text-xs text-slate-500">{safetyBoundary}</p>
                <p className="mt-1 text-xs text-slate-500">{safetyDisclosure}</p>
                <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">Safe Copy Commands are grouped by Validation, Python Worker, Targeted Tests, and Git Safety.</p>
                {message ? <p className="mt-3 rounded-md bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{message}</p> : null}
              </div>

              <Command.List className="max-h-[62vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No operator commands found.</Command.Empty>

                {contextCommands.length > 0 ? (
                  <Command.Group heading="Context Suggestions" className="cmdk-group">
                    {contextCommands.map((command) => renderCommandItem(command, { badges: true }))}
                  </Command.Group>
                ) : null}

                {favoriteCommands.length > 0 ? (
                  <div className="px-2 py-2" aria-label="Favorite commands">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Favorites</p>
                    <div className="flex flex-wrap gap-2">
                      {favoriteCommands.map((command) => (
                        <button
                          key={command.id}
                          type="button"
                          onClick={() => selectCommand(command)}
                          className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          {command.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {recentCommands.length > 0 ? (
                  <div className="px-2 py-2" aria-label="Recent commands">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Recent Commands</p>
                    <div className="flex flex-wrap gap-2">
                      {recentCommands.map((command) => (
                        <button
                          key={`${command.id}-${command.used_at}`}
                          type="button"
                          onClick={() => {
                            const storedCommand = getCommandById(command.id);
                            if (storedCommand) {
                              selectCommand(storedCommand);
                            }
                          }}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100"
                        >
                          {command.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <Command.Group heading="Navigation" className="cmdk-group">
                  {navigationCommands.map((command) => renderCommandItem(command))}
                </Command.Group>

                <div className="px-3 pt-3 text-xs font-bold uppercase tracking-wide text-slate-500">Safe Copy Commands</div>
                {copyGroups.map((group) => {
                  const commands = copyCommands.filter((command) => command.group === group);
                  if (commands.length === 0) {
                    return null;
                  }
                  return (
                    <Command.Group key={group} heading={group} className="cmdk-group">
                      {commands.map((command) => renderCommandItem(command, { badges: true }))}
                    </Command.Group>
                  );
                })}

                <Command.Group heading="Safety Info" className="cmdk-group">
                  {safetyInfoCommands.map((command) => renderCommandItem(command))}
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  );
}
