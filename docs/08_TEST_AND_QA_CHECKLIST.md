# 08 Test And QA Checklist

## Required Commands

```powershell
npm run test
npm run lint
npm run build
python -m compileall python-worker
```

## Worker Job QA

- Claim returns one pending job.
- Already claimed job is not claimed by another worker.
- Heartbeat updates job and worker heartbeat.
- Complete with `video_url` moves queue item to `video_ready`.
- Complete without `video_url` does not complete job.
- Complete without `video_url` does not move queue item to `video_ready`.
- Fail stores `error_message` and uses retry policy.
- Missing or wrong `WORKER_API_SECRET` returns 401.

## Next Batch QA

- `python_worker_enabled=false` creates no jobs.
- Missing `video_render` in `allowed_worker_job_types` creates no jobs.
- `max_daily_videos` limit prevents additional jobs.
- No due scheduled items returns safe no-op.
- Missing `selected_affiliate_url` moves item to `manual_review`.
- Missing disclosure text moves item to `manual_review`.
- Missing script moves item to `manual_review`.
- Missing thumbnail/image URL moves item to `manual_review`.
- n8n webhook is not called by `/api/run/next-batch`.

## Security QA

- Client components do not reference `WORKER_API_SECRET`.
- Client components do not reference service role or provider API keys.
- Logs do not print Authorization headers.
- `.env.local` is not committed.
- `data/*.json` is not committed.

## Upload QA

- `run_mode` default is `generate_only`.
- `youtube_upload_enabled` default is `false`.
- No real YouTube/TikTok/Threads upload code path is enabled.
