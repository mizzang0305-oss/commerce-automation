# Daily69 bounded complete Sheets read contract

## Cause and scope

The old projection, repository, snapshot and cutover readers requested `A1:AH1000`
for Queue, `A1:L1000` for Reserve and `A1:L100` for Sync. The API does not paginate
those requests automatically. Gateways also discarded response range provenance,
and the old in-memory gateway ignored requested ranges, masking the cutoff.

With 951 historical Queue data rows, appending 69 occupies physical rows 953–1021.
The former reader saw only 48 new rows and omitted 21; a later projection could
append those missing identities again. The same defect applied to Reserve/Sync.

## Complete, bounded contract

- Queue reads exactly columns A:AH (34); Reserve/Sync exactly A:L (12).
- Metadata must contain exactly one matching sheet, valid grid dimensions and
  enough schema columns. More than 10,000 allocated rows fails closed before pages.
- Read every allocated row in deterministic, non-overlapping 500-row windows.
  The final window ends at the metadata row count, including empty trailing pages.
- Values responses must identify the exact sheet and requested A1 bounds. Quoted
  names, escaped apostrophes and absolute `$` markers are normalized, not ignored.
- USER_ENTERED grid responses must identify exactly one sheet/GridData object,
  with the correct zero-based startRow/startColumn. Missing/duplicate/overlapping/
  reordered pages, wrong dimensions, malformed values and oversized pages reject.
- Restore omitted blank rows between pages; trim only global trailing empty rows.
  Metadata is reopened after the last page; dimension drift rejects the snapshot.
- Gateways without metadata and strict page capabilities fail closed. No legacy
  1,000-row fallback, whole-workbook scraping, automatic resize or repair exists.

Google documents that [ValueRange.range covers the requested range while trailing
empty rows/columns may be omitted](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values#ValueRange),
and [GridData startRow/startColumn correspond to each requested range](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/sheets#GridData).
An empty but correctly identified page is valid; an API that lies about its
contents while retaining valid metadata cannot be distinguished from genuine blanks.

## Immutability and append guards

Projection plans are derived directly from complete USER_ENTERED snapshots, not
volatile formula render results. A semantic fingerprint covers every schema cell,
physical row position and grid dimensions. All three snapshots and append capacity
are revalidated before any write, and each sheet is revalidated again before apply.
Append capacity includes the header and must fit both allocated rows and the hard
cap. Empty-rendered formulas remain occupied cells and cannot be overwritten.

Cutover reopens the retained baseline immediately before projection, then verifies
historical rows and exact namespace counts after writing. New v2 baselines also
bind header semantics. Older v1/v2 baselines remain readable, but only attest the
rows actually recorded at their original capture; they cannot retroactively prove
previously truncated history. Fresh capture uses the complete reader.

The historical scope is the named projection sheets and their exact schema columns,
not unrelated workbook columns. Commands/settings/logs retain their existing
separate contracts. Sheets has no cross-request transaction: concurrent external
edits after the final prewrite read remain possible; post-write verification detects
them and fails closed without automatic rollback or replay.

## Read quota and bounded operation

The no-upload client serializes each GET attempt, including retries, with a minimum
1,100 ms start interval using a monotonic clock. This is at most 55 GETs per rolling
minute for that client. Writes retain one attempt and have no added retry/pacing.
The policy addresses the documented [60 read requests/minute/user/project quota](https://developers.google.com/workspace/sheets/api/limits).
Other processes using the same service account can still consume shared quota;
429/network retries remain bounded, and exhaustion rejects rather than fabricating
readback success. No service-account scope or credential behavior is expanded.

The local API transport regression measures the complete current-size cutover flow:
124 GETs, 3 local fixture writes, 135.3 seconds simulated GET spacing, at most 55 GETs
per minute. Production writes/credential use are not part of this verification.

## Verification and rollback

`tests/daily69-first-operation/sheetsCompleteRead.test.ts` covers all three sheets
at 999/1000/1001 rows, multiple/empty pages, cross-boundary namespace and duplicate
identities, mutation/deletion/reordering/formula changes after row1000, header
integrity, metadata/capability/page failures, capacity, prewrite races, exact
951+69 append/readback and repeat projection append0. The transport fixture exercises
the real no-upload client with injected fetch/clock only. Read pacing and retry
tests remain in `sheetsRetry.test.ts`.

Rollback is source-only through a reviewed revert; never delete historical rows
or replay writes as rollback. A reverted truncated reader must not ARM or certify
an operation whose required dataset extends beyond its old range.
