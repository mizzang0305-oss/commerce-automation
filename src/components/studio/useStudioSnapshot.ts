"use client";

import { useEffect, useRef, useState } from "react";
import { emptyStudioModel, type StudioModel } from "@/lib/commerce-studio/model";
import { compareStudioSnapshotCursor, studioRetryDelay, studioSnapshotIsStale } from "@/lib/commerce-studio/snapshotOrder";

const POLL_MS = 30_000;

export function useStudioSnapshot(initialModel: StudioModel, enabled = true) {
  const [model, setModel] = useState(initialModel);
  const modelRef = useRef(initialModel);
  const [authExpired, setAuthExpired] = useState(false);
  const [syncDelayed, setSyncDelayed] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let unauthorized = false;
    let halted = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      if (!stopped && !unauthorized && !halted) timer = setTimeout(() => { void poll(); }, delay);
    };
    const poll = async () => {
      if (stopped || unauthorized || controller || document.hidden || !navigator.onLine) return;
      controller = new AbortController();
      const active = controller;
      const timeout = setTimeout(() => active.abort(), 10_000);
      let delay = POLL_MS;
      try {
        const response = await fetch("/api/studio/snapshot", { cache: "no-store", signal: active.signal });
        if (response.status === 401 || response.status === 403) {
          unauthorized = true;
          modelRef.current = emptyStudioModel();
          setModel(modelRef.current);
          setAuthExpired(true);
          return;
        }
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
          throw Object.assign(new Error("STUDIO_SNAPSHOT_FETCH_FAILED"),
            { retryAfter: response.headers.get("retry-after") });
        }
        const incoming = await response.json() as StudioModel;
        if (!incoming || !Object.prototype.hasOwnProperty.call(incoming, "snapshotCursor") ||
            !Array.isArray(incoming.slots) || !Array.isArray(incoming.contents))
          throw new Error("STUDIO_SNAPSHOT_RESPONSE_INVALID");
        const order = compareStudioSnapshotCursor(modelRef.current.snapshotCursor, incoming.snapshotCursor);
        if (order === "conflict") throw new Error("STUDIO_SNAPSHOT_CURSOR_CONFLICT");
        if (order !== "stale") { modelRef.current = incoming; setModel(incoming); }
        failures = 0;
        setSyncDelayed(false);
        setClock(Date.now());
      } catch (error) {
        if (!stopped && !active.signal.aborted) {
          failures += 1;
          const retryAfter = error && typeof error === "object" && "retryAfter" in error &&
            typeof error.retryAfter === "string" ? error.retryAfter : null;
          const retry = studioRetryDelay(failures, retryAfter, Date.now());
          if (retry === null) halted = true;
          else delay = retry;
          setSyncDelayed(true);
        }
      } finally {
        clearTimeout(timeout);
        if (controller === active) controller = undefined;
        if (!stopped && !unauthorized && !halted) schedule(delay);
      }
    };
    const resume = () => {
      if (document.hidden || !navigator.onLine) { controller?.abort(); if (timer) clearTimeout(timer); }
      else if (!halted) schedule(0);
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    const clockTimer = setInterval(() => setClock(Date.now()), 15_000);
    schedule(POLL_MS);
    return () => {
      stopped = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      clearInterval(clockTimer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [enabled]);

  return { model: { ...model, sourceStale: studioSnapshotIsStale(model, clock) }, authExpired, syncDelayed };
}
