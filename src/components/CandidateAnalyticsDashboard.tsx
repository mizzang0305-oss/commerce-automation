"use client";

import { useState } from "react";
import type { CandidateAnalyticsResponse, CollectorSeedStrategy } from "@/lib/candidates/candidateAnalytics";

export function CandidateAnalyticsDashboard({ analytics }: { analytics: CandidateAnalyticsResponse }) {
  const [copyMessage, setCopyMessage] = useState("");
  const applied = analytics.applied_filters ?? {
    status: "all",
    collected_mode: "all",
    sort: "final_score_desc",
    limit: 50
  };
  const available = analytics.available_filters ?? {
    keywords: [],
    categories: [],
    risk_flags: [],
    statuses: [],
    collected_modes: [],
    collector_versions: []
  };

  async function copySeedList() {
    const keywords = [
      ...(analytics.seed_strategy?.keep_keywords ?? []),
      ...(analytics.seed_strategy?.expand_keywords ?? [])
    ].map((item) => item.keyword);
    await writeClipboard(keywords.join("\n"));
    setCopyMessage("Seed strategy is for copy/export only. No collector was executed.");
  }

  async function copySeedJson() {
    await writeClipboard(JSON.stringify(analytics.seed_strategy ?? {}, null, 2));
    setCopyMessage("Seed strategy is for copy/export only. No collector was executed.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Candidate Scoring Analytics</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Candidate quality proxy only. No sales outcome is inferred.
            </p>
          </div>
          <div className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700">
            Read-only: queue_created=false, worker_jobs_created=false, upload_triggered=false
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-bold text-slate-950">Analytics Filters</h2>
        <p className="mt-1 text-sm text-slate-600">
          This analysis is a candidate selection reference. It does not run collectors, create queue rows, create worker jobs, or upload.
        </p>
        <form method="get" className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <FilterInput label="From" name="from" type="date" value={applied.from ?? ""} />
          <FilterInput label="To" name="to" type="date" value={applied.to ?? ""} />
          <FilterInput label="Keyword" name="keyword" value={applied.keyword ?? ""} list="candidate-keywords" />
          <FilterInput label="Category" name="category" value={applied.category ?? ""} list="candidate-categories" />
          <FilterSelect label="Risk flag" name="risk_flag" value={applied.risk_flag ?? "all"} options={["all", ...available.risk_flags]} />
          <FilterSelect label="Status" name="status" value={applied.status} options={["all", "collected", "scored", "duplicate", "manual_review", "rejected", "promoted"]} />
          <FilterInput label="Min score" name="min_score" type="number" value={String(applied.min_score ?? "")} />
          <FilterInput label="Max score" name="max_score" type="number" value={String(applied.max_score ?? "")} />
          <FilterSelect label="Collected mode" name="collected_mode" value={applied.collected_mode} options={["all", "dry_run", "api", "manual", ...available.collected_modes]} />
          <FilterInput label="Collector version" name="collector_version" value={applied.collector_version ?? ""} list="candidate-collector-versions" />
          <FilterSelect label="Sort" name="sort" value={applied.sort} options={["newest", "oldest", "final_score_desc", "final_score_asc", "duplicate_rate_desc", "risk_rate_desc"]} />
          <FilterInput label="Limit" name="limit" type="number" value={String(applied.limit)} />
          <datalist id="candidate-keywords">{available.keywords.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id="candidate-categories">{available.categories.map((item) => <option key={item} value={item} />)}</datalist>
          <datalist id="candidate-collector-versions">{available.collector_versions.map((item) => <option key={item} value={item} />)}</datalist>
          <div className="flex items-end gap-2 xl:col-span-4">
            <button type="submit" className="rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800">
              Apply filters
            </button>
            <a href="/candidates/analytics" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100">
              Reset filters
            </a>
          </div>
        </form>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Total Candidates" value={analytics.summary.total_candidates} />
        <Metric label="Avg Final Score" value={analytics.score_summary.avg_final_score} />
        <Metric label="Duplicate Rate" value={percent(rateFromCounts(analytics.summary.duplicate, analytics.summary.total_candidates))} />
        <Metric label="Manual Review Rate" value={percent(rateFromCounts(analytics.summary.manual_review, analytics.summary.total_candidates))} />
        <Metric label="Rejected Rate" value={percent(rateFromCounts(analytics.summary.rejected, analytics.summary.total_candidates))} />
        <Metric label="Promoted Count" value={analytics.summary.promoted} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">Keyword Performance</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Keyword</th>
                  <th className="px-3 py-2">Count</th>
                  <th className="px-3 py-2">Avg final</th>
                  <th className="px-3 py-2">Duplicate</th>
                  <th className="px-3 py-2">Manual review</th>
                  <th className="px-3 py-2">Rejected</th>
                  <th className="px-3 py-2">QA pass</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analytics.keyword_performance.map((item) => (
                  <tr key={item.source_keyword}>
                    <td className="px-3 py-3 font-semibold text-slate-950">{item.source_keyword}</td>
                    <td className="px-3 py-3">{item.candidate_count}</td>
                    <td className="px-3 py-3">{item.avg_final_score}</td>
                    <td className="px-3 py-3">{percent(item.duplicate_rate)}</td>
                    <td className="px-3 py-3">{percent(item.manual_review_rate)}</td>
                    <td className="px-3 py-3">{percent(item.rejected_rate)}</td>
                    <td className="px-3 py-3">{item.qa_pass_rate === null ? "not linked" : percent(item.qa_pass_rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="space-y-4">
          <ScoreBreakdown analytics={analytics} />
          <Recommendations analytics={analytics} />
          <SeedStrategyPanel strategy={analytics.seed_strategy} onCopyList={copySeedList} onCopyJson={copySeedJson} message={copyMessage} />
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">Risk Flag Performance</h2>
          <div className="mt-4 space-y-2">
            {analytics.risk_flag_performance.length === 0 ? (
              <p className="text-sm text-slate-500">No risk flags found.</p>
            ) : (
              analytics.risk_flag_performance.map((item) => (
                <div key={item.risk_flag} className="rounded-md bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-950">{item.risk_flag}</span>
                    <span className="text-slate-500">{item.candidate_count}</span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    manual_review {percent(item.manual_review_rate)} / rejected {percent(item.rejected_rate)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-950">Source Trace</h2>
          <div className="mt-4 space-y-2">
            {analytics.source_trace_summary.map((item) => (
              <div key={item.collected_mode} className="rounded-md bg-slate-50 p-3 text-sm">
                <span className="font-semibold text-slate-950">{item.collected_mode}</span>
                <span className="ml-2 text-slate-500">{item.candidate_count} candidates</span>
                <p className="mt-1 text-slate-600">latest {item.latest_collected_at || "-"}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SeedStrategyPanel({
  strategy,
  onCopyList,
  onCopyJson,
  message
}: {
  strategy?: CollectorSeedStrategy;
  onCopyList: () => void;
  onCopyJson: () => void;
  message: string;
}) {
  const empty = !strategy;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">Seed Strategy</h2>
      <p className="mt-1 text-sm text-slate-600">
        Recommendations can be copied for candidate-only planning. No collector, promotion, queue, worker, or upload action is executed.
      </p>
      {empty ? (
        <p className="mt-3 text-sm text-slate-500">No seed strategy yet.</p>
      ) : (
        <div className="mt-3 grid gap-3">
          <SeedGroup title="Keep" items={strategy.keep_keywords} />
          <SeedGroup title="Expand" items={strategy.expand_keywords} />
          <SeedGroup title="Review" items={strategy.review_keywords} />
          <SeedGroup title="Avoid" items={strategy.avoid_keywords} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onCopyList} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
              Copy seed list
            </button>
            <button type="button" onClick={onCopyJson} className="rounded-md border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">
              Copy JSON
            </button>
          </div>
          {message ? <p className="text-sm font-semibold text-slate-700">{message}</p> : null}
        </div>
      )}
    </div>
  );
}

function SeedGroup({ title, items }: { title: string; items: NonNullable<CollectorSeedStrategy["keep_keywords"]> }) {
  return (
    <div className="rounded-md bg-slate-50 p-3">
      <h3 className="text-sm font-bold text-slate-950">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">No keywords.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {items.map((item) => (
            <li key={`${title}-${item.keyword}`}>
              <span className="font-semibold text-slate-950">{item.keyword}</span> - {item.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScoreBreakdown({ analytics }: { analytics: CandidateAnalyticsResponse }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">Score Breakdown</h2>
      <div className="mt-3 grid gap-2 text-sm">
        <Metric label="Demand" value={analytics.score_summary.avg_demand_score} compact />
        <Metric label="Price" value={analytics.score_summary.avg_price_score} compact />
        <Metric label="Content angle" value={analytics.score_summary.avg_content_angle_score} compact />
        <Metric label="Risk penalty" value={analytics.score_summary.avg_risk_penalty} compact />
        <Metric label="Duplicate penalty" value={analytics.score_summary.avg_duplicate_penalty} compact />
      </div>
    </div>
  );
}

function Recommendations({ analytics }: { analytics: CandidateAnalyticsResponse }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-bold text-slate-950">Recommendations</h2>
      <p className="mt-1 text-sm text-slate-600">Operator reference only. These suggestions do not auto-run collectors.</p>
      <div className="mt-3 space-y-2">
        {analytics.recommendations.map((item) => (
          <div key={`${item.type}-${item.label}`} className="rounded-md bg-slate-50 p-3 text-sm">
            <span className="font-semibold text-slate-950">{item.label}</span>
            <p className="mt-1 text-slate-600">{item.reason}</p>
            <p className="mt-1 text-slate-500">{item.suggested_action}</p>
          </div>
        ))}
        {analytics.recommendations.length === 0 ? <p className="text-sm text-slate-500">No recommendations yet.</p> : null}
      </div>
    </div>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string | number; compact?: boolean }) {
  return (
    <div className={compact ? "rounded-md bg-slate-50 px-3 py-2" : "rounded-lg border border-slate-200 bg-white p-4 shadow-sm"}>
      <span className="block text-xs font-semibold text-slate-500">{label}</span>
      <span className="text-lg font-bold text-slate-950">{value}</span>
    </div>
  );
}

function FilterInput({
  label,
  name,
  value,
  type = "text",
  list
}: {
  label: string;
  name: string;
  value: string;
  type?: string;
  list?: string;
}) {
  return (
    <label className="text-xs font-bold uppercase text-slate-500">
      {label}
      <input
        name={name}
        defaultValue={value}
        type={type}
        list={list}
        className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold normal-case text-slate-800"
      />
    </label>
  );
}

function FilterSelect({ label, name, value, options }: { label: string; name: string; value: string; options: string[] }) {
  const uniqueOptions = [...new Set(options)];
  return (
    <label className="text-xs font-bold uppercase text-slate-500">
      {label}
      <select
        name={name}
        defaultValue={value}
        className="mt-1 block w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold normal-case text-slate-800"
      >
        {uniqueOptions.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function rateFromCounts(count: number, total: number) {
  return total === 0 ? 0 : count / total;
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

async function writeClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(value).catch(() => undefined);
  }
}
