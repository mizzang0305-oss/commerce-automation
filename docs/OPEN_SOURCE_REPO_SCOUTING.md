# Open Source Repo Scouting

Review date: 2026-06-05 KST

Scope:

- Research only.
- No dependency installation.
- No source code copy.
- No external API key added.
- No external API call from the product runtime.
- No production deploy, production smoke, Supabase migration, R2 smoke, worker execution, or platform upload.

Sources reviewed:

- GitHub repository search API and repository metadata.
- Raw license files where GitHub returned `NOASSERTION` or license risk was likely.
- Current commerce-automation architecture and safety boundaries.

Current baseline:

```text
Coupang candidate -> queue -> content draft -> next-batch -> Python Worker -> R2 video_ready -> channel upload package -> manual upload result tracking
```

The scouting goal is to identify useful open-source references or small future PoC candidates without replacing this pipeline.

## 1. Summary Decision

Do not attach any large external framework immediately.

The best next step is a small, operator-facing UI/DX improvement path:

1. Keep using the existing Next.js, Supabase repository adapter, Python Worker, and R2 artifact flow.
2. Use selected repos as design references or narrow PoC candidates only.
3. Prioritize table virtualization, command palette, dashboard quality, and form validation before adding workflow builders, BI platforms, or AI agent frameworks.
4. Avoid AGPL/FSL/commercial-source projects for embedded SaaS use unless a separate legal/commercial review is completed.

## 2. Evaluation Criteria

| Criterion | Why it matters | Preferred result |
| --- | --- | --- |
| License | Embedded SaaS compatibility and redistribution risk | MIT, Apache-2.0, BSD-3-Clause |
| Dependency size | Avoid destabilizing the MVP runtime | Small or already installed |
| Runtime fit | Must fit Next.js/WebApp or Python Worker boundaries | UI-only or optional module |
| Secret surface | Must not add client-visible secrets | No new secrets by default |
| Side effects | Must not create queue/jobs/uploads/deploys | Read-only or explicit operator action |
| Windows compatibility | Local dev and worker validation run on Windows | No Linux-only assumptions |
| Product fit | Must help Coupang MVP operations | Artifact QA, candidates, jobs, dashboards, forms |
| Integration risk | Avoid replatforming | Incremental PR possible |

## 3. Top Candidates

| Repo | License | Stars observed | Fit | Recommendation |
| --- | --- | ---: | --- | --- |
| [TanStack/table](https://github.com/TanStack/table) | MIT | 28060 | Existing table direction for queue/jobs/artifacts | Keep. Continue using as table foundation. |
| [TanStack/virtual](https://github.com/TanStack/virtual) | MIT | 6938 | Bounded rendering for large candidate/artifact/job lists | Best first PoC candidate if dependency approval is granted. |
| [shadcn-ui/ui](https://github.com/shadcn-ui/ui) | MIT | 115768 | Accessible admin UI patterns | Use as reference/component source with controlled copy discipline. |
| [cmdk](https://github.com/dip/cmdk) | MIT | 12652 | Operator command palette for dev/test-lab, queue, artifacts | Good small UX PoC after table work. |
| [recharts/recharts](https://github.com/recharts/recharts) | MIT | 27208 | Existing chart library direction | Prefer improving current dashboard charts before adding analytics platforms. |
| [react-hook-form](https://github.com/react-hook-form/react-hook-form) | MIT | 44757 | Admin/channel/candidate form reliability | Good future forms PoC if not already available. |
| [zod](https://github.com/colinhacks/zod) | MIT | 42865 | Runtime validation and API contracts | Good future validation PoC; add only with explicit dependency approval. |

## 4. Category Findings

### Admin Shells and Dashboards

Useful references:

- [refinedev/refine](https://github.com/refinedev/refine) - MIT, 34832 stars.
- [Kiranism/next-shadcn-dashboard-starter](https://github.com/Kiranism/next-shadcn-dashboard-starter) - MIT, 6519 stars.
- [TailAdmin/free-nextjs-admin-dashboard](https://github.com/TailAdmin/free-nextjs-admin-dashboard) - MIT, 2445 stars.
- [themeselection/materio-mui-nextjs-admin-template-free](https://github.com/themeselection/materio-mui-nextjs-admin-template-free) - MIT, 1937 stars.

Recommendation:

- Do not replatform the app to an admin framework.
- Use these repositories as reference for navigation density, settings pages, empty states, and dashboard information hierarchy.
- Prefer small internal UI improvements over adopting a full admin shell.

### Large Tables and Virtualization

Useful candidates:

- [TanStack/virtual](https://github.com/TanStack/virtual) - MIT, 6938 stars.
- [revolist/revogrid](https://github.com/revolist/revogrid) - MIT, 3400 stars.
- [Autodesk/react-base-table](https://github.com/Autodesk/react-base-table) - MIT, 1535 stars.
- [wellyshen/react-cool-virtual](https://github.com/wellyshen/react-cool-virtual) - MIT, 1224 stars.

Recommendation:

- First choice: TanStack Virtual because the project already uses TanStack table patterns.
- Avoid adopting a full grid system until `/artifacts`, `/candidates`, and `/jobs` prove that the current bounded pagination is not enough.
- Keep virtualization view-only. It must not update QA state, create jobs, create packages, or trigger uploads.

### Command Palette and Operator Productivity

Useful candidates:

- [cmdk](https://github.com/dip/cmdk) - MIT, 12652 stars.
- [react-cmdk](https://github.com/albingroen/react-cmdk) - MIT, 1225 stars.

Recommendation:

- Add a command palette only after the main queue/artifact/candidate flows stabilize.
- Candidate commands: open queue item, open artifact QA, run safe dev smoke step, copy worker command, open channel package.
- Commands must remain explicit operator actions and must not run Python Worker, deploy, upload, or create jobs outside `next-batch`.

### Dashboard Charts and Analytics

Useful candidates:

- [recharts/recharts](https://github.com/recharts/recharts) - MIT, 27208 stars.
- [tremorlabs/tremor](https://github.com/tremorlabs/tremor) - Apache-2.0, 3454 stars.
- [Kanaries/graphic-walker](https://github.com/Kanaries/graphic-walker) - Apache-2.0, 3156 stars.
- [cube-js/cube](https://github.com/cube-js/cube) - Apache-2.0 and MIT license notices, 20101 stars.

Recommendation:

- Prefer Recharts improvements first.
- Defer Tremor unless a new dashboard design pass needs it.
- Defer Graphic Walker and Cube until product volume, semantic metrics, and production hosting are defined.
- Do not add BI servers or semantic layers during the MVP operations phase.

### Workflow Builders and Pipeline Visualization

Useful candidates:

- [xyflow/xyflow](https://github.com/xyflow/xyflow) - MIT, 36940 stars.
- [illacloud/illa-builder](https://github.com/illacloud/illa-builder) - Apache-2.0, 12266 stars.

Recommendation:

- XYFlow is a possible future reference for visualizing the pipeline or seed plan graph.
- Do not adopt ILLA Builder. It is a broad low-code platform and would add a large runtime/security surface that does not match the current custom MVP.
- Do not build a workflow editor before candidate, artifact QA, and manual upload operations have enough repeated operator pain to justify it.

### Feature Flags

Useful candidates:

- [Flagsmith](https://github.com/Flagsmith/flagsmith) - BSD-3-Clause, 6397 stars.
- [go-feature-flag](https://github.com/thomaspoignant/go-feature-flag) - MIT, 2030 stars.

Recommendation:

- Keep current environment/config gates for now.
- Consider feature-flag infrastructure only when production hosting, multiple operators, or staged rollout requirements exist.
- Avoid introducing a separate flag service during the current MVP hardening phase.

### Forms and Validation

Useful candidates:

- [react-hook-form](https://github.com/react-hook-form/react-hook-form) - MIT, 44757 stars.
- [react-hook-form/resolvers](https://github.com/react-hook-form/resolvers) - MIT, 2244 stars.
- [zod](https://github.com/colinhacks/zod) - MIT, 42865 stars.

Recommendation:

- Strong candidate for channel profile, upload package, collector seed plan, and candidate promotion forms.
- Add only when a PR is explicitly scoped to form validation, because this may require new runtime dependencies.
- Server-side validation remains mandatory even if client forms use schemas.

## 5. Avoid or Defer

| Repo | Reason |
| --- | --- |
| [metabase/metabase](https://github.com/metabase/metabase) | Raw license review shows AGPL/commercial boundary. Too heavy and high license risk for embedded SaaS use without legal review. |
| [openreplay/openreplay](https://github.com/openreplay/openreplay) | Raw license review shows AGPL default outside listed restrictions. Adds session replay privacy/security surface. |
| [chartbrew/chartbrew](https://github.com/chartbrew/chartbrew) | Functional Source License with commercial license language for SaaS/reseller use. Not appropriate without commercial review. |
| [illacloud/illa-builder](https://github.com/illacloud/illa-builder) | Large low-code platform. Broad runtime/security surface and not aligned with candidate-only/worker-only boundaries. |
| [ScrapeGraphAI/scrapecraft](https://github.com/ScrapeGraphAI/scrapecraft) | AI scraping direction risks terms, bot, and anti-bypass boundaries. Not aligned with safe collector rules. |
| [pydantic/pydantic-ai](https://github.com/pydantic/pydantic-ai) | Interesting AI agent framework, but would add AI-provider/dependency surface before the current template-based MVP needs it. |

## 6. Immediate PoC Candidates

### PR A: Artifact/Candidate Table Virtualization PoC

Candidate dependency:

- `@tanstack/virtual`

Scope:

- Improve bounded rendering for `/artifacts`, `/candidates`, or `/jobs`.
- Keep server-side pagination and selection safety.
- No QA state change from virtualization.
- No worker job, render plan, upload package, platform upload, production deploy, or DB migration side effect.

Risk:

- Low to medium. New UI dependency and rendering behavior require browser verification.

### PR B: Operator Command Palette

Candidate dependency:

- `cmdk`

Scope:

- Navigate between queue, candidates, artifacts, jobs, channels, and dev/test-lab.
- Copy safe commands such as Python Worker run instructions.
- No command may execute Python Worker, production deploy, platform upload, or Supabase writes without existing guarded APIs.

Risk:

- Low to medium. Needs keyboard accessibility and careful command allowlist.

### PR C: Form Validation Hardening

Candidate dependencies:

- `react-hook-form`
- `zod`
- `@hookform/resolvers`

Scope:

- Channel profile editor.
- Upload package status forms.
- Candidate seed/import forms.
- Shared server/client validation messages.

Risk:

- Medium if new dependencies are added. Keep server-side validation as source of truth.

## 7. Recommended Order

1. Finish current MVP stabilization and production-readiness gates.
2. Add TanStack Virtual only if large-list browser performance needs more than current bounded pagination.
3. Add form validation hardening for operator forms.
4. Add command palette for navigation and safe command copying.
5. Reassess analytics/BI after production hosting target, data retention, and operator metrics are settled.
6. Reassess workflow visualization after seed plan and collector flows produce repeated operational complexity.

## 8. Hard Boundaries for Future PRs

Any future adoption PR must preserve these boundaries:

- No production deploy or production smoke unless explicitly requested.
- No Supabase migration/db push unless explicitly requested and reviewed.
- No YouTube/TikTok/Threads upload implementation.
- No OAuth token storage.
- No public upload enablement.
- No automatic queue/job/render_plan/upload_package side effects from read-only UI.
- No WebApp execution of Python Worker.
- No client exposure of service role, R2, Coupang, worker, OpenAI, Gemini, or Authorization secrets.
- No dependency install without a named PR scope, license review, and validation plan.

## 9. Final Conclusion

The safest adoption strategy is selective reference and small PoCs, not framework integration.

Recommended immediate path:

- Keep PR #48's artifact QA large-list safeguards.
- Use TanStack Virtual as the first possible dependency PoC only if measured UI performance requires it.
- Use shadcn/ui, dashboard starters, and admin frameworks as visual references, not as replatforming targets.
- Avoid AGPL/FSL/commercial-source analytics/session-replay tools until legal and production architecture reviews are complete.
- Keep all platform upload, public upload, production deploy, and worker execution boundaries unchanged.
