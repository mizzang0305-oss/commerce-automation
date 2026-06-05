# Artifact QA Productivity Polish

Artifact QA productivity features make manual review faster while preserving manual-only upload semantics.

## Scope

- Review queue shortcuts for common QA filters.
- Bulk note templates for repeatable review notes.
- Keyboard shortcuts for table navigation and QA status changes.
- Dashboard summary counts for pending, needs-fix, missing-asset, and reviewed states.

## Keyboard Shortcuts

- `/`: focus artifact search
- `Esc`: clear selection and leave search
- `j`: move selection down
- `k`: move selection up
- `x`: toggle current artifact selection
- `p`: mark selected artifact `passed`
- `f`: mark selected artifact `needs_fix`
- `r`: mark selected artifact `rejected`
- `u`: mark selected artifact `pending`

Shortcuts are disabled while an input, textarea, select, or editable field is focused.

## Safety Rules

Artifact QA updates review metadata only:

- `product_assets.qa_status`
- `product_assets.qa_note`
- `product_assets.render_qa_metadata`
- `product_assets.updated_at`

Artifact QA must not:

- create worker jobs
- change queue items to uploaded or posted
- create upload packages
- call YouTube, TikTok, Threads, or any public upload API
- expose service role keys, storage secrets, worker secrets, or Authorization headers

Pagination is a read-only extension of this workflow. It may change the visible page, page size, filters, and sort order, but it must not update QA status or trigger worker/upload side effects.

Large-list table optimization is also read-only. The UI caps rendered rows to the current page window, clears selection
when the operator changes page/filter/sort/page size, and keeps keyboard selection inside the visible page.

Mutation responses and UI messages must make this explicit:

```text
QA status only changed. No platform upload was executed.
```
