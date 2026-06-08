from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from time import monotonic
from typing import Any, Callable, Literal

import requests

HotPlatform = Literal["bilibili", "youtube", "douyin", "kuaishou", "xiaohongshu"]
HotPlatformFilter = Literal["all", "bilibili", "youtube", "douyin", "kuaishou", "xiaohongshu"]
PlatformStatus = Literal["ok", "error", "unavailable"]

SUPPORTED_HOT_PLATFORMS: tuple[HotPlatform, ...] = (
    "bilibili",
    "youtube",
    "douyin",
    "kuaishou",
    "xiaohongshu",
)
CACHE_TTL_SECONDS = 600
DEFAULT_TIMEOUT_SECONDS = 6


@dataclass(frozen=True)
class HotVideoItem:
    id: str
    platform: HotPlatform
    title: str
    url: str
    cover_url: str = ""
    author: str = ""
    rank: int = 0
    hot_score: str = ""
    source: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class PlatformHotVideoResult:
    platform: HotPlatform
    status: PlatformStatus
    message: str
    items: list[HotVideoItem]

    def to_dict(self) -> dict[str, Any]:
        return {
            "platform": self.platform,
            "status": self.status,
            "message": self.message,
            "items": [item.to_dict() for item in self.items],
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _normalize_image_url(url: Any) -> str:
    text = str(url or "").strip()
    if text.startswith("//"):
        return f"https:{text}"
    return text


def _format_bilibili_views(view_count: Any) -> str:
    try:
        count = int(view_count or 0)
    except (TypeError, ValueError):
        count = 0
    if count >= 10000:
        return f"{count / 10000:.1f}万播放"
    return f"{count}播放"


def _map_bilibili_popular_items(payload: dict[str, Any], limit: int) -> list[HotVideoItem]:
    rows = ((payload.get("data") or {}).get("list") or [])[:limit]
    items: list[HotVideoItem] = []
    for row in rows:
        bvid = str(row.get("bvid") or "").strip()
        title = str(row.get("title") or "").strip()
        if not bvid or not title:
            continue
        owner = row.get("owner") or {}
        stat = row.get("stat") or {}
        items.append(
            HotVideoItem(
                id=bvid,
                platform="bilibili",
                title=title,
                url=f"https://www.bilibili.com/video/{bvid}",
                cover_url=_normalize_image_url(row.get("pic")),
                author=str(owner.get("name") or "").strip(),
                rank=len(items) + 1,
                hot_score=_format_bilibili_views(stat.get("view")),
                source="bilibili_popular",
            )
        )
    return items
