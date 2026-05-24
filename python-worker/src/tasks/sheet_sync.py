from pathlib import Path
from ..config import WorkerConfig
from ..storage_client import StorageClient
from ..sheets.excel_exporter import export_rows
from ..sheets.excel_importer import import_rows
from ..sheets.google_sheet_sync import sync_google_sheet
from ..utils.files import clean_dir


def run_sheet_sync(job: dict, config: WorkerConfig, storage: StorageClient, heartbeat) -> dict:
    payload = job.get("payload", {})
    output_dir = clean_dir(Path("outputs") / job["id"])
    input_path = payload.get("input_path")
    rows = import_rows(Path(input_path)) if input_path else list(payload.get("rows", []))
    heartbeat()
    google_result = sync_google_sheet(rows, payload) if payload.get("google_sheet_id") else {"skipped": True}
    export_path = export_rows(rows, output_dir / "sheet_export.xlsx")
    export_url = storage.upload("sheet_export", export_path, f"{job['id']}/sheet_export.xlsx")
    return {"row_count": len(rows), "sheet_export_url": export_url, "google_sheet_sync": google_result}
