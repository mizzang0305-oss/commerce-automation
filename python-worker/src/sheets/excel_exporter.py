from pathlib import Path
import pandas as pd


def export_rows(rows: list[dict], target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame(rows).to_excel(target, index=False)
    return target
