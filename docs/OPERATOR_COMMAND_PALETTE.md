# Operator Command Palette

The operator command palette is a navigation and safe-copy aid for the admin app.
It is opened with `Ctrl+K` on Windows/Linux or `Cmd+K` on macOS.

## Scope

The palette supports:

- Navigation to operator pages such as dashboard, candidates, analytics, artifacts, readiness, jobs, runs, settings, and dev/test lab.
- Copy-only validation command snippets.
- Read-only safety reminders.

The palette does not execute commands. It does not call mutation APIs.

## Safe Copy Commands

Allowed snippets are validation commands only:

```powershell
npm run check:mojibake
npm run check:production-env
npm run preflight:production-pilot
npm run test
python -m unittest discover python-worker/tests
npm run lint
npm run build
python -m compileall python-worker
```

The Python Worker validation PATH setup can also be copied as text. It only prepares the current PowerShell session for worker tests; it does not start `worker.py`.

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
- While the palette input is focused, page-level shortcuts such as Artifact QA `j/k/x/p/f/r/u` are ignored.
- No command in the palette contains raw secrets or deploy/upload/db-write commands.
