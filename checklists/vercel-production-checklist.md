# Vercel Production Checklist

This checklist prepares the WebApp deployment target. It does not execute deployment.

## Project

- [ ] Vercel project selected.
- [ ] GitHub repository connected.
- [ ] Repository root selected as project root.
- [ ] Build command is `npm run build`.
- [ ] Production branch is `main`.
- [ ] Production deployment is explicitly approved before any deploy command is run.

## Server Env

- [ ] `AUTOMATION_REPOSITORY_ADAPTER=supabase`.
- [ ] `SUPABASE_URL` set server-side.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set server-side.
- [ ] `WORKER_API_SECRET` set server-side.
- [ ] `PUBLIC_APP_BASE_URL` set to the deployed Vercel URL.
- [ ] `CONTENT_AI_PROVIDER=template`.
- [ ] `ENABLE_DEV_TOOLS` false or unset.
- [ ] `ENABLE_MOCK_STORAGE_ROUTE` false or unset.

## Forbidden Env

- [ ] No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- [ ] No `NEXT_PUBLIC_WORKER_API_SECRET`.
- [ ] No `NEXT_PUBLIC_COUPANG_SECRET_KEY`.
- [ ] No `NEXT_PUBLIC_OPENAI_API_KEY`.
- [ ] No `NEXT_PUBLIC_GEMINI_API_KEY`.
- [ ] No `NEXT_PUBLIC_R2_SECRET_ACCESS_KEY`.
- [ ] No public upload flag enabled.
- [ ] No YouTube auto-upload flag enabled.

## Post-Deploy Checks

- [ ] Diagnostics show `repository.adapter=supabase`.
- [ ] Diagnostics show configured booleans only.
- [ ] Mutating `/api/dev/*` routes are blocked in normal production.
- [ ] `/mock-storage` is disabled in normal production.
- [ ] WebApp does not launch Python Worker.
- [ ] `next-batch` remains the only worker-job creation path.
