from pathlib import Path
import textwrap


def wrap_caption(text: str, max_chars: int = 24, max_lines: int = 2) -> list[str]:
    cleaned = " ".join(text.strip().split())
    if not cleaned:
        return []

    lines = textwrap.wrap(
        cleaned,
        width=max_chars,
        break_long_words=True,
        break_on_hyphens=False,
    )
    if not lines:
        lines = [cleaned[:max_chars]]

    clipped = lines[:max_lines]
    if len(lines) > max_lines and clipped:
        clipped[-1] = clipped[-1].rstrip(" .")[: max(1, max_chars - 3)] + "..."
    return clipped


def resolve_subtitle_cue_texts(
    text: str,
    shot_durations: list[float] | None,
    shot_captions: list[str] | None = None,
) -> list[str]:
    if shot_captions is not None:
        if not shot_durations:
            raise ValueError("shot durations are required for shot captions")
        if len(shot_captions) != len(shot_durations):
            raise ValueError("shot caption count must match shot duration count")
        lines = [" ".join(str(caption).split()) for caption in shot_captions]
        if not lines or any(not line for line in lines):
            raise ValueError("shot captions must be non-empty")
        return lines

    source_lines = [line.strip() for line in text.splitlines() if line.strip()]
    if shot_durations:
        if len(source_lines) != len(shot_durations):
            raise ValueError("subtitle cue count must match shot duration count")
        return source_lines
    return [line.strip() for line in textwrap.wrap(text, width=32) if line.strip()]


def write_srt(
    text: str,
    target: Path,
    shot_durations: list[float] | None = None,
    shot_captions: list[str] | None = None,
) -> Path:
    lines = resolve_subtitle_cue_texts(text, shot_durations, shot_captions)

    if not lines:
        raise ValueError("subtitle text is required")
    target.parent.mkdir(parents=True, exist_ok=True)
    blocks = []

    elapsed = 0.0
    cue_lines = lines if shot_durations else lines[:20]
    for index, line in enumerate(cue_lines, start=1):
        if shot_durations:
            duration = shot_durations[index - 1]
            if isinstance(duration, bool) or not isinstance(duration, (int, float)) or duration <= 0:
                raise ValueError("shot duration must be positive")
            start = elapsed
            end = elapsed + float(duration)
            elapsed = end
        else:
            start = index - 1
            end = index

        caption = "\n".join(wrap_caption(line))
        blocks.append(f"{index}\n{_format_timestamp(start)} --> {_format_timestamp(end)}\n{caption}\n")
    target.write_text("\n".join(blocks), encoding="utf-8")
    return target


def _format_timestamp(seconds: float) -> str:
    milliseconds = int(round(seconds * 1000))
    hours, remainder = divmod(milliseconds, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"
