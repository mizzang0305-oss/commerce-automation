"use client";

import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { ClipboardCopy, Compass, Info, Search } from "lucide-react";
import { useRouter } from "next/navigation";

type NavigationCommand = {
  label: string;
  description: string;
  href: string;
};

type CopyCommand = {
  label: string;
  description: string;
  value: string;
};

const safetyNotice = "Command Palette\ub294 \ud398\uc774\uc9c0 \uc774\ub3d9\uacfc \uc548\uc804\ud55c \uba85\ub839\uc5b4 \ubcf5\uc0ac\ub9cc \uc9c0\uc6d0\ud569\ub2c8\ub2e4.";
const safetyBoundary = "Worker \uc2e4\ud589, production deploy, DB write, platform upload\ub294 \uc2e4\ud589\ud558\uc9c0 \uc54a\uc2b5\ub2c8\ub2e4.";

const navigationCommands: NavigationCommand[] = [
  { label: "Dashboard", description: "Operator overview and MVP status", href: "/dashboard" },
  { label: "Candidates", description: "Review collected product candidates", href: "/candidates" },
  { label: "Candidate Analytics", description: "Analyze seed, scoring, and collector signals", href: "/candidates/analytics" },
  { label: "Candidate Seed Plan", description: "Open candidate analytics seed planning section", href: "/candidates/analytics#seed-plan" },
  { label: "Artifacts", description: "Manual QA for video, thumbnail, subtitle, and package artifacts", href: "/artifacts" },
  { label: "Production Readiness", description: "Readiness checks without running deploys", href: "/ops/production-readiness" },
  { label: "Runs", description: "Inspect automation run history", href: "/runs" },
  { label: "Jobs", description: "Inspect worker job queue state", href: "/jobs" },
  { label: "Settings", description: "Review safe settings and upload-disabled defaults", href: "/settings" },
  { label: "Dev/Test Lab", description: "Development-only smoke workflow panel", href: "/dev/test-lab" }
];

const copyCommands: CopyCommand[] = [
  { label: "Copy mojibake check", description: "Copy safe text for UTF-8 source scan", value: "npm run check:mojibake" },
  { label: "Copy production env check", description: "Copy safe text for local production env readiness report", value: "npm run check:production-env" },
  { label: "Copy production pilot preflight", description: "Copy safe text for approval-gated pilot preflight", value: "npm run preflight:production-pilot" },
  { label: "Copy npm run test", description: "Copy full Vitest command", value: "npm run test" },
  { label: "Copy Python worker unittest", description: "Copy worker test command without starting the worker", value: "python -m unittest discover python-worker/tests" },
  { label: "Copy npm run lint", description: "Copy lint command", value: "npm run lint" },
  { label: "Copy npm run build", description: "Copy build command", value: "npm run build" },
  { label: "Copy Python compileall", description: "Copy compile check command", value: "python -m compileall python-worker" },
  {
    label: "Copy Python 3.12 PATH setup",
    description: "Copy PowerShell session setup for worker validation only",
    value: '$env:Path = "C:\\Users\\LOVE\\MyProjects\\commerce-automation\\python-worker\\.venv\\Scripts;$env:Path"\npython --version\npython -m unittest discover python-worker/tests'
  }
];

const safetyNotes = [
  "Current safety boundaries",
  "Production pilot remains approval-gated",
  "Candidate-only collector never creates queue rows",
  "Artifact QA changes review status only and never uploads"
];

export function OperatorCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

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

  function navigate(href: string) {
    router.push(href);
    setMessage("");
    setOpen(false);
  }

  async function copyText(value: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(value).catch(() => undefined);
    }
    setMessage("Copied safe command text. No command was executed.");
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
            className="mx-auto w-[min(720px,100%)] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl"
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
                {message ? <p className="mt-3 rounded-md bg-teal-50 px-3 py-2 text-xs font-bold text-teal-700">{message}</p> : null}
              </div>

              <Command.List className="max-h-[60vh] overflow-y-auto p-2">
                <Command.Empty className="px-3 py-8 text-center text-sm font-semibold text-slate-500">No operator commands found.</Command.Empty>

                <Command.Group heading="Navigation" className="cmdk-group">
                  {navigationCommands.map((command) => (
                    <Command.Item
                      key={command.href}
                      value={`${command.label} ${command.description}`}
                      onSelect={() => navigate(command.href)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100"
                    >
                      <Compass size={16} className="text-teal-700" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-950">{command.label}</span>
                        <span className="block text-xs text-slate-500">{command.description}</span>
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Safe Copy Commands" className="cmdk-group">
                  {copyCommands.map((command) => (
                    <Command.Item
                      key={command.label}
                      value={`${command.label} ${command.description} ${command.value}`}
                      onSelect={() => void copyText(command.value)}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100"
                    >
                      <ClipboardCopy size={16} className="text-slate-500" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold text-slate-950">{command.label}</span>
                        <span className="block text-xs text-slate-500">{command.description}</span>
                      </span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase text-slate-600">Copy only</span>
                      <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold uppercase text-orange-700">No execution</span>
                    </Command.Item>
                  ))}
                </Command.Group>

                <Command.Group heading="Safety Info" className="cmdk-group">
                  {safetyNotes.map((note) => (
                    <Command.Item
                      key={note}
                      value={note}
                      onSelect={() => setMessage("Read-only safety information. No command was executed.")}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-700 data-[selected=true]:bg-slate-100"
                    >
                      <Info size={16} className="text-slate-500" aria-hidden="true" />
                      <span className="font-bold text-slate-950">{note}</span>
                      <span className="ml-auto rounded-full bg-teal-50 px-2 py-1 text-[10px] font-bold uppercase text-teal-700">Safe text</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              </Command.List>
            </Command>
          </div>
        </div>
      ) : null}
    </>
  );
}
