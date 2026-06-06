# Operator Command Palette

The operator command palette is a navigation and safe-copy aid for the admin app.
It is opened with `Ctrl+K` on Windows/Linux or `Cmd+K` on macOS.

## Scope

The palette supports:

- Navigation to operator pages such as dashboard, candidates, analytics, artifacts, readiness, jobs, runs, settings, and dev/test lab.
- Recent command history stored locally as command id, label, type, and timestamp only.
- Favorite commands stored locally as safe command ids only.
- Context-aware command suggestions for the current page.
- Copy-only validation, Python Worker validation, targeted test, and git safety command snippets.
- Search aliases such as `qa`, `seed`, `preflight`, `test`, `worker`, `env`, and `queue`.
- Read-only safety reminders.

The palette does not execute commands. It does not call mutation APIs.

## Safe Copy Commands

Allowed snippets are safe text only. They are grouped as:

- Validation
- Python Worker
- Targeted Tests
- Git Safety

```powershell
npm run check:mojibake
npm run check:production-env
npm run preflight:production-pilot
npm run test
npm run lint
npm run build
python --version
python -m unittest discover python-worker/tests
python -m compileall python-worker
npm run test -- candidates
npm run test -- artifacts
npm run test -- dashboard
npm run test -- production
npm run test -- tests/operator-command-palette.test.tsx
git status --short
git diff --check
git diff --cached --check
```

The Python Worker validation PATH setup can also be copied as text. It only prepares the current PowerShell session for worker tests; it does not start `worker.py`.

## Local Storage

Recent commands and favorites use browser `localStorage` only. They do not write to the server, Supabase, or any API.

Recent commands store only:

- `id`
- `label`
- `type`
- `used_at`

Favorites store only command ids. Neither store copied command bodies, `.env` contents, secrets, tokens, or Authorization headers.

## Context Suggestions

The palette can show page-specific suggestions:

- `/dashboard`: production readiness, candidate analytics, full validation command copy.
- `/candidates/analytics`: seed plan jump, candidate tests, candidate review.
- `/artifacts`: pending review queue, needs-fix queue, artifact QA test copy.
- `/ops/production-readiness`: preflight and production-env command copies.

Context suggestions remain navigation/copy-only.

## Explicit Non-Goals

The palette must not:

- Start Python Worker.
- Run production deploys.
- Run database writes, migrations, SQL writes, or Supabase db push.
- Run collectors, queue creation, worker job creation, render plan creation, or upload package creation.
- Trigger YouTube, TikTok, Threads, public upload, or platform upload behavior.
- Copy `.env.local`, `python-worker/.env`, service-role keys, storage secrets, API keys, or Authorization headers.

## QA Expectations

- `Ctrl+K` and `Cmd+K` open the palette.
- `Esc` closes the palette.
- Navigation commands call client-side routing only.
- Copy commands write safe text to the clipboard and show a no-execution message.
- Recent and favorite commands persist locally without command bodies or secrets.
- Context suggestions change by route and remain navigation/copy-only.
- Search aliases find expected destinations and safe snippets.
- While the palette input is focused, page-level shortcuts such as Artifact QA `j/k/x/p/f/r/u` are ignored.
- No command in the palette contains raw secrets or deploy/upload/db-write commands.
