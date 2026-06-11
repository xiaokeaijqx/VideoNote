import re
from typing import List, Tuple


def _format_seconds(total_seconds: int) -> str:
    total_seconds = max(0, int(total_seconds))
    return f"{total_seconds // 60:02d}:{total_seconds % 60:02d}"


def extract_screenshot_timestamps(markdown: str) -> List[Tuple[str, int]]:
    pattern = r"(\*?Screenshot-(?:\[(\d{2}):(\d{2})\]|(\d{2}):(\d{2})))"
    results: List[Tuple[str, int]] = []
    for match in re.finditer(pattern, markdown):
        mm = match.group(2) or match.group(4)
        ss = match.group(3) or match.group(5)
        total_seconds = int(mm) * 60 + int(ss)
        results.append((match.group(1), total_seconds))
    return results


def extract_content_timestamps(markdown: str, limit: int = 4) -> List[int]:
    pattern = r"\*?Content-\[(\d{2}):(\d{2})\]"
    seen: set[int] = set()
    results: List[int] = []
    for match in re.finditer(pattern, markdown):
        total_seconds = int(match.group(1)) * 60 + int(match.group(2))
        if total_seconds in seen:
            continue
        seen.add(total_seconds)
        results.append(total_seconds)
        if len(results) >= limit:
            break
    return results


def ensure_screenshot_markers(markdown: str, duration: float | int | None, max_markers: int = 3) -> str:
    if extract_screenshot_timestamps(markdown) or extract_content_timestamps(markdown, limit=1):
        return markdown

    try:
        duration_seconds = max(0, int(float(duration or 0)))
    except (TypeError, ValueError):
        duration_seconds = 0

    if duration_seconds <= 0:
        timestamps = [0]
    else:
        timestamps = [
            max(0, min(duration_seconds - 1, round(duration_seconds * ratio)))
            for ratio in (0.25, 0.5, 0.75)
        ][:max_markers]

    unique_timestamps: List[int] = []
    for ts in timestamps:
        if ts not in unique_timestamps:
            unique_timestamps.append(ts)

    marker_block = "\n\n".join(f"*Screenshot-[{_format_seconds(ts)}]" for ts in unique_timestamps)
    return f"{markdown.rstrip()}\n\n## 关键画面\n\n{marker_block}\n"
