import Link from "next/link";
import { ImagePromptPlanClient } from "@/components/ImagePromptPlanClient";
import { buildCommerceImagePromptPlan } from "@/lib/image-prompts/prompt-builder";
import { getAutomationRepository } from "@/lib/repositories/automationRepository";
import type { ProductCandidate } from "@/types/automation";

export const dynamic = "force-dynamic";

type ImagePromptsPageProps = {
  searchParams?: Promise<{ candidate_id?: string }>;
};

export default async function ImagePromptsPage(
  props: ImagePromptsPageProps = {},
  testData?: { candidates?: ProductCandidate[] }
) {
  const searchParams = props.searchParams ? await props.searchParams : {};
  const candidates = testData?.candidates ?? await getAutomationRepository().getProductCandidates();
  const selectedCandidate = candidates.find((candidate) => candidate.id === searchParams.candidate_id) ?? candidates[0] ?? null;
  const plan = selectedCandidate ? buildCommerceImagePromptPlan(selectedCandidate) : null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-950">Commerce Image Prompts</h1>
          <p className="mt-2 text-sm text-slate-500">
            이 화면은 이미지 생성 계획과 프롬프트만 만듭니다. 실제 이미지 생성, 영상 생성, 업로드는 실행하지 않습니다.
          </p>
        </div>
        <Link
          href="/candidates"
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
        >
          Open candidates
        </Link>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold text-slate-950">Candidate selector</h2>
        {candidates.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {candidates.slice(0, 24).map((candidate) => (
              <Link
                key={candidate.id}
                href={`/image-prompts?candidate_id=${encodeURIComponent(candidate.id)}`}
                className={`rounded-md border px-3 py-2 text-xs font-bold ${
                  selectedCandidate?.id === candidate.id
                    ? "border-teal-300 bg-teal-50 text-teal-800"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {candidate.product_name || candidate.id}
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No product candidates are available for image prompt planning.</p>
        )}
      </section>

      <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        Plan-only / copy-only workflow입니다. 이미지 생성, 영상 생성, 업로드, Worker 실행, 외부 AI 호출, Google Drive 연동, queue, render plan, worker job 생성 기능은 제공하지 않습니다.
      </section>

      {plan ? <ImagePromptPlanClient plan={plan} /> : null}
    </div>
  );
}
