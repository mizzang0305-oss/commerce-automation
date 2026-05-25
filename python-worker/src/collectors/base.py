from dataclasses import dataclass
from hashlib import sha256
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd


@dataclass(frozen=True)
class CandidateRecord:
    id: str
    product_name: str
    source_url: str
    selected_affiliate_url: str
    source: str
    payload: dict


NAME_COLUMNS = ("product_name", "name", "title", "상품명")
URL_COLUMNS = ("url", "product_url", "raw_coupang_url", "source_url", "링크")
AFFILIATE_COLUMNS = ("selected_affiliate_url", "affiliate_url", "제휴링크")


def load_table(path: Path) -> list[dict]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        frame = pd.read_csv(path).fillna("")
    elif suffix in {".xlsx", ".xls"}:
        frame = pd.read_excel(path).fillna("")
    else:
        raise ValueError("CSV 또는 XLSX 파일만 가져올 수 있습니다.")
    return frame.astype(str).to_dict(orient="records")


def rows_to_candidates(rows: list[dict], source: str) -> list[CandidateRecord]:
    candidates: dict[str, CandidateRecord] = {}
    for row in rows:
        product_name = pick(row, NAME_COLUMNS)
        source_url = strip_trailing_slash(pick(row, URL_COLUMNS))
        affiliate_url = strip_trailing_slash(pick(row, AFFILIATE_COLUMNS))
        if not product_name:
            raise ValueError("상품명이 비어 있습니다.")
        if not source_url:
            raise ValueError("상품 URL이 비어 있습니다.")
        if not is_safe_http_url(source_url) or (affiliate_url and not is_safe_http_url(affiliate_url)):
            raise ValueError("http/https URL만 가져올 수 있습니다.")

        candidate_id = create_candidate_id(source_url)
        candidates.setdefault(
            candidate_id,
            CandidateRecord(
                id=candidate_id,
                product_name=product_name,
                source_url=source_url,
                selected_affiliate_url=affiliate_url,
                source=source,
                payload={
                    "source": source,
                    "source_url": source_url,
                    "category_path": pick(row, ("category_path", "category", "카테고리")),
                    "keyword": pick(row, ("keyword", "키워드")),
                    "price_now_text": pick(row, ("price_now_text", "price", "가격")),
                },
            ),
        )
    return list(candidates.values())


def pick(row: dict, columns: tuple[str, ...]) -> str:
    for column in columns:
        value = str(row.get(column, "")).strip()
        if value:
            return value
    return ""


def is_safe_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def strip_trailing_slash(value: str) -> str:
    return value.strip().rstrip("/")


def create_candidate_id(source_url: str) -> str:
    digest = sha256(source_url.encode("utf-8")).hexdigest()[:16]
    return f"candidate-{digest}"
