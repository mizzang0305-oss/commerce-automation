import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyStudioModel, type StudioModel } from "@/lib/commerce-studio/model";
import { compareStudioSnapshotCursor, studioRetryDelay, studioSnapshotIsStale } from "@/lib/commerce-studio/snapshotOrder";
import { useStudioSnapshot } from "@/components/studio/useStudioSnapshot";

const cursor = { sourceSequence: 1, sourceRevision: "revision-1", eventId: "event-1", environmentId: "preview", hostId: "host" };
function model(sequence = 1): StudioModel {
  const value = emptyStudioModel(new Date());
  return { ...value, observedAt: new Date().toISOString(), receivedAt: new Date().toISOString(),
    snapshotCursor: { ...cursor, sourceSequence: sequence, sourceRevision: `revision-${sequence}`, eventId: `event-${sequence}` },
    publisherSource: "connected", contents: [] };
}

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Studio snapshot cursor and polling", () => {
  it("rejects stale and same-sequence conflicting envelopes", () => {
    expect(compareStudioSnapshotCursor(cursor, { ...cursor, sourceSequence: 0 })).toBe("stale");
    expect(compareStudioSnapshotCursor(cursor, { ...cursor, sourceRevision: "changed" })).toBe("conflict");
    expect(compareStudioSnapshotCursor(cursor, { ...cursor, hostId: "other" })).toBe("conflict");
    expect(compareStudioSnapshotCursor(cursor, { ...cursor, sourceSequence: 2 })).toBe("newer");
  });

  it("uses local time for stale indication and bounded Retry-After backoff", () => {
    const value = model();
    expect(studioSnapshotIsStale(value, Date.parse(value.receivedAt!) + 181_000)).toBe(true);
    expect(studioRetryDelay(1, "120", Date.now())).toBe(120_000);
    expect(studioRetryDelay(10, null, Date.now())).toBe(300_000);
    expect(studioRetryDelay(1, "600", Date.now())).toBe(600_000);
    expect(studioRetryDelay(1, "not-a-delay", Date.now())).toBeNull();
  });

  it("updates an open page without navigation after the next snapshot", async () => {
    vi.useFakeTimers();
    const next = model(2);
    const fetch = vi.fn(async () => new Response(JSON.stringify(next), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetch);
    const { result, unmount } = renderHook(() => useStudioSnapshot(model()));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.model.snapshotCursor?.sourceSequence).toBe(2);
    unmount();
  });

  it("clears sensitive data and stops polling on unauthorized response", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => new Response(JSON.stringify({ safeError: "STUDIO_OWNER_UNAUTHORIZED" }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const initial = { ...model(), contents: [{ id: "job", evidenceSource: "job" as const, productName: "private",
      channelKey: "father_jobs" as const, status: "ready" as const, createdAt: new Date().toISOString(),
      publishedAt: null, youtubeUrl: null, title: "private" }] };
    const { result, unmount } = renderHook(() => useStudioSnapshot(initial));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(result.current.authExpired).toBe(true);
    expect(result.current.model.contents).toEqual([]);
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(fetch).toHaveBeenCalledTimes(1);
    unmount();
  });
});
