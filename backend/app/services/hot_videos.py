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


_CacheEntry = tuple[float, dict[str, Any]]
_CACHE: dict[tuple[str, int], _CacheEntry] = {}


def clear_hot_video_cache() -> None:
    _CACHE.clear()


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
        }
    )
    return session


def _fetch_bilibili_hot(limit: int) -> PlatformHotVideoResult:
    response = _session().get(
        "https://api.bilibili.com/x/web-interface/popular",
        params={"ps": limit, "pn": 1},
        timeout=DEFAULT_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    payload = response.json()
    if payload.get("code") not in (0, None):
        raise RuntimeError(str(payload.get("message") or "B 站热点接口返回异常"))
    items = _map_bilibili_popular_items(payload, limit=limit)
    return PlatformHotVideoResult(
        platform="bilibili",
        status="ok" if items else "error",
        message="" if items else "B 站热点暂时没有可用视频",
        items=items,
    )


def _fetch_youtube_hot(limit: int) -> PlatformHotVideoResult:
    html = _session().get(
        "https://www.youtube.com/feed/trending",
        timeout=DEFAULT_TIMEOUT_SECONDS,
    ).text
    items = _map_youtube_trending_html(html, limit=limit)
    return PlatformHotVideoResult(
        platform="youtube",
        status="ok" if items else "error",
        message="" if items else "YouTube 热点暂时获取失败，可稍后刷新或手动粘贴链接",
        items=items,
    )


def _fetch_douyin_hot(limit: int) -> PlatformHotVideoResult:
    response = _session().get(
        "https://www.douyin.com/aweme/v1/web/hot/search/list/",
        params={
            "device_platform": "webapp",
            "aid": "6383",
            "channel": "channel_pc_web",
            "detail_list": "1",
        },
        timeout=DEFAULT_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    items = _map_douyin_hot_items(response.json(), limit=limit)
    return PlatformHotVideoResult(
        platform="douyin",
        status="ok" if items else "error",
        message="" if items else "抖音热点受风控限制，稍后刷新或手动粘贴链接",
        items=items,
    )


def _fetch_kuaishou_hot(limit: int) -> PlatformHotVideoResult:
    return PlatformHotVideoResult(
        platform="kuaishou",
        status="error",
        message="快手热点暂时获取失败，可手动粘贴链接",
        items=[],
    )


def _fetch_xiaohongshu_hot(limit: int) -> PlatformHotVideoResult:
    return PlatformHotVideoResult(
        platform="xiaohongshu",
        status="unavailable",
        message="小红书暂未提供稳定公开视频热点源",
        items=[],
    )


HOT_FETCHERS: dict[HotPlatform, Callable[[int], PlatformHotVideoResult]] = {
    "bilibili": _fetch_bilibili_hot,
    "youtube": _fetch_youtube_hot,
    "douyin": _fetch_douyin_hot,
    "kuaishou": _fetch_kuaishou_hot,
    "xiaohongshu": _fetch_xiaohongshu_hot,
}


def _platforms_for_filter(platform: str) -> list[HotPlatform]:
    if platform == "all":
        return list(HOT_FETCHERS.keys())
    if platform not in HOT_FETCHERS:
        raise ValueError(f"不支持的热点平台: {platform}")
    return [platform]  # type: ignore[list-item]


def _normalize_limit(limit: int) -> int:
    try:
        value = int(limit)
    except (TypeError, ValueError):
        value = 12
    return max(1, min(value, 30))


def _error_result(platform: HotPlatform, exc: Exception) -> PlatformHotVideoResult:
    return PlatformHotVideoResult(
        platform=platform,
        status="error",
        message=str(exc) or "热点暂时获取失败",
        items=[],
    )


def fetch_hot_videos(platform: str = "all", limit: int = 12) -> list[PlatformHotVideoResult]:
    safe_limit = _normalize_limit(limit)
    results: list[PlatformHotVideoResult] = []
    for name in _platforms_for_filter(platform):
        try:
            results.append(HOT_FETCHERS[name](safe_limit))
        except Exception as exc:
            results.append(_error_result(name, exc))
    return results


def fetch_hot_video_payload(
    platform: str = "all",
    limit: int = 12,
    *,
    force: bool = False,
) -> dict[str, Any]:
    safe_limit = _normalize_limit(limit)
    key = (platform, safe_limit)
    now = monotonic()
    if not force:
        cached = _CACHE.get(key)
        if cached and now - cached[0] < CACHE_TTL_SECONDS:
            return cached[1]

    results = fetch_hot_videos(platform=platform, limit=safe_limit)
    payload = {
        "platform": platform,
        "limit": safe_limit,
        "generated_at": _now_iso(),
        "platforms": [result.to_dict() for result in results],
    }
    _CACHE[key] = (now, payload)
    return payload


def _map_youtube_trending_html(html: str, limit: int) -> list[HotVideoItem]:
    return []


def _map_douyin_hot_items(payload: dict[str, Any], limit: int) -> list[HotVideoItem]:
    return []
