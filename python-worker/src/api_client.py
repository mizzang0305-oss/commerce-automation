import time
import requests
from .config import WorkerConfig


class WorkerApiClient:
    def __init__(self, config: WorkerConfig):
        self.config = config
        self.session = requests.Session()
        self.session.headers.update({
            "Authorization": f"Bearer {config.worker_api_secret}",
            "Content-Type": "application/json",
        })

    def claim_job(self):
        response = self.session.post(
            f"{self.config.web_app_base_url}/api/worker/jobs/claim",
            json={"worker_id": self.config.worker_id, "job_types": self.config.job_types},
            timeout=30,
        )
        response.raise_for_status()
        return response.json().get("job")

    def heartbeat(self, job_id: str):
        response = self.session.post(
            f"{self.config.web_app_base_url}/api/worker/jobs/{job_id}/heartbeat",
            json={"worker_id": self.config.worker_id},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def complete_job(self, job_id: str, result: dict):
        response = self.session.post(
            f"{self.config.web_app_base_url}/api/worker/jobs/{job_id}/complete",
            json={"worker_id": self.config.worker_id, "result": result},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    def fail_job(self, job_id: str, error_message: str):
        response = self.session.post(
            f"{self.config.web_app_base_url}/api/worker/jobs/{job_id}/fail",
            json={"worker_id": self.config.worker_id, "error_message": error_message},
            timeout=30,
        )
        response.raise_for_status()
        return response.json()

    @staticmethod
    def sleep(seconds: int):
        time.sleep(seconds)
