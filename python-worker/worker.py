from src.runtime_check import ensure_supported_runtime


def main() -> None:
    ensure_supported_runtime()

    from src.api_client import WorkerApiClient
    from src.config import load_config
    from src.storage_client import StorageClient
    from src.tasks.sheet_sync import run_sheet_sync
    from src.tasks.video_render import run_video_render
    from src.utils.logger import get_logger

    logger = get_logger("worker")
    config = load_config()
    api = WorkerApiClient(config)
    storage = StorageClient(config)
    logger.info("worker started", extra={"worker_id": config.worker_id})

    while True:
        job = api.claim_job()
        if not job:
            api.sleep(config.poll_interval_seconds)
            continue

        try:
            api.heartbeat(job["id"])
            if job["job_type"] == "video_render":
                result = run_video_render(job, config, storage, lambda: api.heartbeat(job["id"]))
            elif job["job_type"] == "sheet_sync":
                result = run_sheet_sync(job, config, storage, lambda: api.heartbeat(job["id"]))
            else:
                raise ValueError(f"unsupported job_type: {job['job_type']}")
            api.complete_job(job["id"], result)
        except Exception as exc:
            logger.exception("job failed", extra={"job_id": job.get("id")})
            api.fail_job(job["id"], str(exc))


if __name__ == "__main__":
    main()
