from pathlib import Path

from .base import CandidateRecord, load_table, rows_to_candidates


def load_candidates_from_table(path: Path, source: str = "toss_csv") -> list[CandidateRecord]:
    return rows_to_candidates(load_table(path), source=source)
