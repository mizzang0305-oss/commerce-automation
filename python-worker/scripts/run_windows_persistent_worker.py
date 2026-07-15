"""Launch the Windows worker with sanitized runtime evidence and durable logs."""

from __future__ import annotations

import argparse
from contextlib import redirect_stderr, redirect_stdout
import json
import os
from pathlib import Path
import subprocess
import sys
import time

def load_env_files(paths: list[Path], base_env: dict[str, str] | None = None) -> dict[str, str]:
    """Merge dotenv files without allowing them to override the process environment."""
    merged = dict(base_env if base_env is not None else os.environ)
    protected = set(merged)
    for path in paths:
        if not path.is_file():
            continue
        for key, value in _read_dotenv(path).items():
            if key and value is not None and key not in protected:
                merged[key] = value
    return merged


def _read_dotenv(path: Path) -> dict[str, str | None]:
    try:
        from dotenv import dotenv_values

        return dict(dotenv_values(path))
    except ImportError:
        # Some isolated tests stub dotenv with load_dotenv only. Runtime uses
        # python-dotenv; this fallback also keeps simple KEY=value files usable.
        values: dict[str, str | None] = {}
        for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if key:
                values[key] = value.strip().strip('"').strip("'")
        return values


def validate_production_worker_env(env: dict[str, str]) -> list[str]:
    blockers: list[str] = []
    base_url = env.get("WEB_APP_BASE_URL", "").strip().rstrip("/")
    if not base_url.startswith("https://") or "localhost" in base_url.lower():
        blockers.append("WEB_APP_BASE_URL must be a non-local HTTPS URL")
    if not env.get("WORKER_API_SECRET", "").strip():
        blockers.append("WORKER_API_SECRET is required")
    if env.get("STORAGE_BACKEND", "").strip().lower() != "r2":
        blockers.append("STORAGE_BACKEND must be r2")
    for key in ("R2_ENDPOINT_URL", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"):
        if not env.get(key, "").strip():
            blockers.append(f"{key} is required")
    if env.get("KOREAN_VOICE_PROVIDER", "").strip().lower() != "local_command":
        blockers.append("KOREAN_VOICE_PROVIDER must be local_command")
    if env.get("KOREAN_VOICE_PROVIDER_APPROVED", "").strip().lower() not in {"1", "true", "yes", "y"}:
        blockers.append("KOREAN_VOICE_PROVIDER_APPROVED must be true")
    if not env.get("KOREAN_VOICE_COMMAND", "").strip():
        blockers.append("KOREAN_VOICE_COMMAND is required")
    return blockers


def resolve_git_head(repo_root: Path) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def write_pid_evidence(runtime_dir: Path, repo_root: Path, env: dict[str, str]) -> None:
    runtime_dir.mkdir(parents=True, exist_ok=True)
    evidence = {
        "pid": os.getpid(),
        "head": resolve_git_head(repo_root),
        "storage_backend": env.get("STORAGE_BACKEND", "").strip().lower(),
        "started_epoch": int(time.time()),
        "launcher": "windows_scheduled_task",
    }
    target = runtime_dir / "worker.pid.json"
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(evidence, ensure_ascii=True), encoding="utf-8")
    temporary.replace(target)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--worker-root", type=Path, required=True)
    parser.add_argument("--runtime-dir", type=Path, required=True)
    parser.add_argument("--env-file", action="append", type=Path, default=[])
    parser.add_argument("--web-app-base-url", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    worker_root = args.worker_root.resolve()
    runtime_dir = args.runtime_dir.resolve()
    worker_entry = worker_root / "worker.py"
    if not worker_entry.is_file():
        raise RuntimeError("worker.py was not found under --worker-root")

    env = load_env_files([path.resolve() for path in args.env_file])
    env["WEB_APP_BASE_URL"] = args.web_app_base_url.strip().rstrip("/")
    blockers = validate_production_worker_env(env)
    if blockers:
        raise RuntimeError("Worker startup blocked: " + "; ".join(blockers))

    os.environ.clear()
    os.environ.update(env)
    os.chdir(worker_root)
    sys.path.insert(0, str(worker_root))
    write_pid_evidence(runtime_dir, worker_root.parent, env)

    stdout_path = runtime_dir / "worker.stdout.log"
    stderr_path = runtime_dir / "worker.stderr.log"
    with stdout_path.open("a", encoding="utf-8", buffering=1) as stdout_log, \
        stderr_path.open("a", encoding="utf-8", buffering=1) as stderr_log, \
        redirect_stdout(stdout_log), redirect_stderr(stderr_log):
        from worker import main as worker_main

        worker_main()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        # Task Scheduler needs a non-zero exit to apply its restart policy.
        sys.stderr.write(f"persistent worker launcher failed: {type(exc).__name__}: {exc}\n")
        raise SystemExit(1)
