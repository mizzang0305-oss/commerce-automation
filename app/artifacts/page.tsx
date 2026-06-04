import { ArtifactQaClient } from "@/components/ArtifactQaClient";
import { listArtifactQaSummaries } from "@/lib/artifacts/artifactQa";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";

export const dynamic = "force-dynamic";

export default async function ArtifactsPage() {
  const result = await listArtifactQaSummaries(getAutomationRepository());

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-950">Worker Artifact QA</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Review generated videos, thumbnails, subtitles, and upload packages before manual channel upload. QA actions do not trigger platform uploads.
        </p>
      </div>
      <ArtifactQaClient artifacts={result.artifacts} summary={result.summary} />
    </div>
  );
}
