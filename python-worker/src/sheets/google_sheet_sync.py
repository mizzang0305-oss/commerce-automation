def sync_google_sheet(rows: list[dict], payload: dict) -> dict:
    if not payload.get("google_sheet_id"):
        return {"skipped": True}
    return {
        "skipped": True,
        "reason": "google sheets credentials are optional and not configured in this worker scaffold",
        "row_count": len(rows),
    }
