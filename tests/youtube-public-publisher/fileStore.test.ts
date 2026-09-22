import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { FileYouTubePublicPublisherStore } from "@/lib/youtube-public-publisher/fileStore";

describe("file-backed public publisher state", () => {
  test("serializes concurrent claims for the same ready job", async () => {
    const directory = await mkdtemp(join(tmpdir(), "youtube-public-publisher-"));
    const statePath = join(directory, "publisher-state.json");
    const store = new FileYouTubePublicPublisherStore<{ jobs: Array<{ id: string; status: string; claimOwner?: string }> }>(statePath, {
      jobs: []
    });

    try {
      await store.mutate((state) => {
        state.jobs.push({ id: "single-ready-job", status: "ready" });
      });

      const claims = await Promise.all([
        store.mutate((state) => claimFirstReadyJob(state, "publisher-a")),
        store.mutate((state) => claimFirstReadyJob(state, "publisher-b"))
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      expect((await store.read()).jobs).toEqual([
        expect.objectContaining({ id: "single-ready-job", status: "uploading" })
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("fails closed when another publisher process holds the state lock", async () => {
    const directory = await mkdtemp(join(tmpdir(), "youtube-public-publisher-lock-"));
    const statePath = join(directory, "publisher-state.json");
    const firstStore = new FileYouTubePublicPublisherStore<{ jobs: string[] }>(statePath, { jobs: [] });
    const secondStore = new FileYouTubePublicPublisherStore<{ jobs: string[] }>(statePath, { jobs: [] });
    let releaseFirstMutation: (() => void) | undefined;
    let firstMutationEntered: (() => void) | undefined;
    const firstEntered = new Promise<void>((resolve) => {
      firstMutationEntered = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseFirstMutation = resolve;
    });

    try {
      const first = firstStore.mutate(async (state) => {
        firstMutationEntered?.();
        await release;
        state.jobs.push("claimed-by-first");
      });
      await firstEntered;

      await expect(secondStore.mutate(() => undefined)).rejects.toThrow("YOUTUBE_PUBLIC_PUBLISHER_STATE_LOCK_HELD");
      releaseFirstMutation?.();
      await first;
      await expect(firstStore.read()).resolves.toEqual({ jobs: ["claimed-by-first"] });
    } finally {
      releaseFirstMutation?.();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

function claimFirstReadyJob(state: { jobs: Array<{ id: string; status: string; claimOwner?: string }> }, claimOwner: string) {
  const job = state.jobs.find((candidate) => candidate.status === "ready");
  if (!job) {
    return false;
  }
  job.status = "uploading";
  job.claimOwner = claimOwner;
  return true;
}
