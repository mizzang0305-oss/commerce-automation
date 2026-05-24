from pathlib import Path
import pandas as pd


def import_rows(path: Path) -> list[dict]:
    if not path.exists():
        raise FileNotFoundError(path)
    if path.suffix.lower() == ".csv":
        frame = pd.read_csv(path)
    else:
        frame = pd.read_excel(path)
    return frame.fillna("").to_dict(orient="records")
