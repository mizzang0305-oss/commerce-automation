from pathlib import Path
import textwrap


def write_srt(text: str, target: Path) -> Path:
    lines = [line.strip() for line in textwrap.wrap(text, width=32) if line.strip()]
    if not lines:
        raise ValueError("subtitle text is required")
    target.parent.mkdir(parents=True, exist_ok=True)
    blocks = []
    for index, line in enumerate(lines[:20], start=1):
        start = index - 1
        end = index
        blocks.append(f"{index}\n00:00:{start:02d},000 --> 00:00:{end:02d},000\n{line}\n")
    target.write_text("\n".join(blocks), encoding="utf-8")
    return target
