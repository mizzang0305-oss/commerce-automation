from __future__ import annotations

import re
import unicodedata


def normalize_korean_tts_text(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = text.replace("+", " 플러스 ")
    text = re.sub(r"[·•]", ", ", text)
    text = re.sub(r"[^\w\s가-힣.,!?%\-:/]", " ", text, flags=re.UNICODE)
    lines = []
    for line in text.splitlines():
        line = re.sub(r"[ \t]+", " ", line).strip()
        line = re.sub(r"\s+([,.!?])", r"\1", line)
        if line:
            lines.append(line)
    text = "\n".join(lines)
    if not text:
        raise ValueError("korean_tts_text_empty_after_normalization")
    return text


def normalize_asr_comparison_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or "")).casefold()
    return re.sub(r"[^0-9a-z가-힣]", "", normalized)
