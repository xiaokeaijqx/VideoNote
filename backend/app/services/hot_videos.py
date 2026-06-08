from __future__ import annotations

import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
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
BILIBILI_POPULAR_API_URL = "https://api.bilibili.com/x/web-interface/popular"
BILIBILI_POPULAR_READER_URL = (
    "https://r.jina.ai/http://r.jina.ai/http://https://www.bilibili.com/v/popular/all"
)
BILIBILI_POPULAR_SNAPSHOT: tuple[dict[str, str], ...] = (
    {
        "id": "BV1xkE46PE59",
        "title": "参加了九次高考的考生采访",
        "cover_url": "https://i1.hdslb.com/bfs/archive/2c51e17d5ab278033691d055015af26638867e5b.jpg@412w_232h_1c_!web-popular.avif",
        "author": "自来卷三木",
        "hot_score": "275.2万播放",
    },
    {
        "id": "BV1Z37D6UEYz",
        "title": "被 偷 家 了 ！",
        "cover_url": "https://i1.hdslb.com/bfs/archive/127ba31467e867d7c850176898391dd977cf4c52.jpg@412w_232h_1c_!web-popular.avif",
        "author": "野生鱼白",
        "hot_score": "116.7万播放",
    },
    {
        "id": "BV1wE7m67EAF",
        "title": "“我在成华大道「拼接遗憾」”",
        "cover_url": "https://i1.hdslb.com/bfs/archive/b7a88bfce9322211ddb670d69d549967dba6591e.jpg@412w_232h_1c_!web-popular.avif",
        "author": "15万点赞 Dieorite",
        "hot_score": "69.1万播放",
    },
    {
        "id": "BV16kV26TES7",
        "title": "当父母说出了正确答案：",
        "cover_url": "https://i0.hdslb.com/bfs/archive/982b25c4ef21fb08f77ae933c89f4b99d5b0c86a.jpg@412w_232h_1c_!web-popular.avif",
        "author": "百万播放 进击的金厂长",
        "hot_score": "636.6万播放",
    },
    {
        "id": "BV1QzVR63E3L",
        "title": "回忆永远都是加分项",
        "cover_url": "https://i2.hdslb.com/bfs/archive/f4dc3fe8ea88a450877315e867b4995121d5dbf6.jpg@412w_232h_1c_!web-popular.avif",
        "author": "百万播放 央视新闻",
        "hot_score": "381万播放",
    },
    {
        "id": "BV1o47S6UEQy",
        "title": "仅粉丝可见的神颜",
        "cover_url": "https://i2.hdslb.com/bfs/archive/e6c40e8a1ff00524db7ed3aaf7269a0b772fc266.jpg@412w_232h_1c_!web-popular.avif",
        "author": "十一的看脸日记",
        "hot_score": "162.2万播放",
    },
    {
        "id": "BV11wE46hETZ",
        "title": "没错，针对的就是日本和菲律宾！",
        "cover_url": "https://i1.hdslb.com/bfs/archive/df29614140c555cf5b6ded8663f3289dc532104a.jpg@412w_232h_1c_!web-popular.avif",
        "author": "央视军事",
        "hot_score": "19.6万播放",
    },
    {
        "id": "BV1TJE862ESA",
        "title": "《女神异闻录４ Revival》预购宣传片",
        "cover_url": "https://i1.hdslb.com/bfs/archive/7b600cf3f7dc7a7557ee87005d0ee09b76c64bc6.jpg@412w_232h_1c_!web-popular.avif",
        "author": "2万分享 SEGA世嘉官方",
        "hot_score": "30.4万播放",
    },
    {
        "id": "BV1AnEx68Eh5",
        "title": "特厨探店|明星开的小面馆，真实水平到底怎么样—八号院儿",
        "cover_url": "https://i0.hdslb.com/bfs/archive/ef4fdbb48e2a5d5ea262e50d686a682df48c1727.jpg@412w_232h_1c_!web-popular.avif",
        "author": "特厨隋坡",
        "hot_score": "98万播放",
    },
    {
        "id": "BV1kME464EJs",
        "title": "小小极客湾，拿下！",
        "cover_url": "https://i2.hdslb.com/bfs/archive/ba90a910e391dc0aab61116cff6707a1253fa15d.jpg@412w_232h_1c_!web-popular.avif",
        "author": "笔吧评测室",
        "hot_score": "62万播放",
    },
    {
        "id": "BV1AsEx6oE3t",
        "title": "给我把桑多涅变回来！",
        "cover_url": "https://i2.hdslb.com/bfs/archive/511d7c8790049145678aca03eaac77fd4f8826b6.jpg@412w_232h_1c_!web-popular.avif",
        "author": "白银新手",
        "hot_score": "10.5万播放",
    },
    {
        "id": "BV1MPEH6REki",
        "title": "菜月昴老师，我还记得你",
        "cover_url": "https://i1.hdslb.com/bfs/archive/1f4223d2a450a938cb907407be90e8091333ccc2.jpg@412w_232h_1c_!web-popular.avif",
        "author": "人气飙升 完勒Linew",
        "hot_score": "22.5万播放",
    },
)


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


def _map_bilibili_reader_markdown_items(markdown: str, limit: int) -> list[HotVideoItem]:
    lines = markdown.splitlines()
    items: list[HotVideoItem] = []
    seen: set[str] = set()
    link_pattern = re.compile(
        r"\[!\[[^\]]+\]\((?P<cover>[^)]*)\)\]\("
        r"(?P<url>https://www\.bilibili\.com/video/(?P<bvid>BV[0-9A-Za-z]+)[^)]*)\)"
    )
    for index, line in enumerate(lines):
        match = link_pattern.search(line)
        if not match:
            continue
        bvid = match.group("bvid")
        if bvid in seen:
            continue
        details = _next_nonempty_lines(lines, index + 1, count=3)
        if not details:
            continue
        title = details[0]
        if not title:
            continue
        seen.add(bvid)
        items.append(
            HotVideoItem(
                id=bvid,
                platform="bilibili",
                title=title,
                url=f"https://www.bilibili.com/video/{bvid}",
                cover_url=_normalize_image_url(match.group("cover")),
                author=details[1] if len(details) > 1 else "",
                rank=len(items) + 1,
                hot_score=_format_reader_bilibili_hot_score(details[2] if len(details) > 2 else ""),
                source="bilibili_popular_reader",
            )
        )
        if len(items) >= limit:
            break
    return items


def _snapshot_bilibili_hot_items(limit: int) -> list[HotVideoItem]:
    return [
        HotVideoItem(
            id=row["id"],
            platform="bilibili",
            title=row["title"],
            url=f"https://www.bilibili.com/video/{row['id']}",
            cover_url=row["cover_url"],
            author=row["author"],
            rank=index + 1,
            hot_score=row["hot_score"],
            source="bilibili_popular_snapshot",
        )
        for index, row in enumerate(BILIBILI_POPULAR_SNAPSHOT[:limit])
    ]


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
    primary_error = ""
    try:
        response = _session().get(
            BILIBILI_POPULAR_API_URL,
            params={"ps": limit, "pn": 1},
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") not in (0, None):
            raise RuntimeError(str(payload.get("message") or "B 站热点接口返回异常"))
        items = _map_bilibili_popular_items(payload, limit=limit)
        if items:
            return PlatformHotVideoResult(
                platform="bilibili",
                status="ok",
                message="",
                items=items,
            )
        primary_error = "B 站热点暂时没有可用视频"
    except Exception as exc:
        primary_error = str(exc) or "B 站热点接口返回异常"

    try:
        response = _session().get(
            BILIBILI_POPULAR_READER_URL,
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        items = _map_bilibili_reader_markdown_items(response.text, limit=limit)
    except Exception:
        items = _snapshot_bilibili_hot_items(limit)
        return PlatformHotVideoResult(
            platform="bilibili",
            status="ok" if items else "error",
            message="实时热点源暂不可用，已显示最近热门快照" if items else primary_error,
            items=items,
        )

    return PlatformHotVideoResult(
        platform="bilibili",
        status="ok" if items else "error",
        message="官方热点接口暂不可用，已切换备用热点源" if items else primary_error,
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
    platform_names = _platforms_for_filter(platform)
    results_by_platform: dict[HotPlatform, PlatformHotVideoResult] = {}
    with ThreadPoolExecutor(max_workers=len(platform_names)) as executor:
        future_to_platform = {
            executor.submit(HOT_FETCHERS[name], safe_limit): name for name in platform_names
        }
        for future in as_completed(future_to_platform):
            name = future_to_platform[future]
            try:
                results_by_platform[name] = future.result()
            except Exception as exc:
                results_by_platform[name] = _error_result(name, exc)
    results: list[PlatformHotVideoResult] = []
    for name in platform_names:
        try:
            results.append(results_by_platform[name])
        except KeyError as exc:
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
    raw_json = _extract_balanced_json(html, "ytInitialData")
    if not raw_json:
        return []
    try:
        payload = json.loads(raw_json)
    except json.JSONDecodeError:
        return []

    items: list[HotVideoItem] = []
    seen: set[str] = set()
    for node in _walk_dicts(payload):
        renderer = node.get("videoRenderer")
        if not isinstance(renderer, dict):
            continue
        video_id = str(renderer.get("videoId") or "").strip()
        title = _first_text(renderer.get("title"))
        if not video_id or not title or video_id in seen:
            continue
        seen.add(video_id)
        thumbnails = ((renderer.get("thumbnail") or {}).get("thumbnails") or [])
        cover_url = ""
        if thumbnails and isinstance(thumbnails[-1], dict):
            cover_url = str(thumbnails[-1].get("url") or "")
        items.append(
            HotVideoItem(
                id=video_id,
                platform="youtube",
                title=title,
                url=f"https://www.youtube.com/watch?v={video_id}",
                cover_url=cover_url,
                author=_first_text(renderer.get("ownerText")),
                rank=len(items) + 1,
                hot_score=_first_text(renderer.get("shortViewCountText")),
                source="youtube_trending",
            )
        )
        if len(items) >= limit:
            break
    return items


def _map_douyin_hot_items(payload: dict[str, Any], limit: int) -> list[HotVideoItem]:
    items: list[HotVideoItem] = []
    seen: set[str] = set()
    for node in _walk_dicts(payload):
        aweme_infos = node.get("aweme_infos")
        if isinstance(aweme_infos, list):
            for aweme in aweme_infos:
                if not isinstance(aweme, dict):
                    continue
                item = _douyin_item_from_node(
                    aweme,
                    rank=len(items) + 1,
                    parent_hot_value=node.get("hot_value"),
                )
                if item and item.id not in seen:
                    seen.add(item.id)
                    items.append(item)
                if len(items) >= limit:
                    return items

    for node in _walk_dicts(payload):
        item = _douyin_item_from_node(node, rank=len(items) + 1)
        if item and item.id not in seen:
            seen.add(item.id)
            items.append(item)
        if len(items) >= limit:
            break
    return items


def _douyin_item_from_node(
    node: dict[str, Any],
    rank: int,
    parent_hot_value: Any = None,
) -> HotVideoItem | None:
    aweme_id = str(node.get("aweme_id") or node.get("group_id") or "").strip()
    if not re.fullmatch(r"\d{10,}", aweme_id or ""):
        return None
    title = str(node.get("desc") or node.get("title") or node.get("word") or "").strip()
    if not title:
        return None
    author = node.get("author") if isinstance(node.get("author"), dict) else {}
    video = node.get("video") if isinstance(node.get("video"), dict) else {}
    hot_value = parent_hot_value or node.get("hot_value") or node.get("view_count") or ""
    return HotVideoItem(
        id=aweme_id,
        platform="douyin",
        title=title,
        url=f"https://www.douyin.com/video/{aweme_id}",
        cover_url=_pick_cover_from_node(video),
        author=str(author.get("nickname") or "").strip(),
        rank=rank,
        hot_score=f"{hot_value}热度" if hot_value else "",
        source="douyin_hot_search",
    )


def _next_nonempty_lines(lines: list[str], start: int, count: int) -> list[str]:
    values: list[str] = []
    for line in lines[start:]:
        text = line.strip()
        if not text:
            continue
        values.append(text)
        if len(values) >= count:
            break
    return values


def _format_reader_bilibili_hot_score(text: str) -> str:
    parts = [part for part in re.split(r"\s+", text.strip()) if part]
    if not parts:
        return ""
    first = parts[0]
    if "播放" in first or not re.search(r"\d", first):
        return first
    return f"{first}播放"


def _first_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        if isinstance(value.get("simpleText"), str):
            return value["simpleText"].strip()
        runs = value.get("runs")
        if isinstance(runs, list):
            return "".join(
                str(run.get("text") or "") for run in runs if isinstance(run, dict)
            ).strip()
    return ""


def _walk_dicts(value: Any):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from _walk_dicts(child)
    elif isinstance(value, list):
        for child in value:
            yield from _walk_dicts(child)


def _extract_balanced_json(text: str, marker: str) -> str:
    start = text.find(marker)
    if start < 0:
        return ""
    brace = text.find("{", start)
    if brace < 0:
        return ""
    depth = 0
    in_string = False
    escaped = False
    for index in range(brace, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[brace : index + 1]
    return ""


def _pick_cover_from_node(node: dict[str, Any]) -> str:
    candidates = [
        node.get("cover"),
        node.get("origin_cover"),
        node.get("dynamic_cover"),
    ]
    for candidate in candidates:
        if isinstance(candidate, dict):
            urls = candidate.get("url_list") or []
            if urls:
                return str(urls[0])
    return ""
