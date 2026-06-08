# Hot Video Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-platform hot video recommendation feature that fetches hot videos, displays them in the new note form, and lets users click a recommendation to fill the existing extraction form.

**Architecture:** Add a focused backend hotspot service and route that return normalized platform results with partial-failure support. Add a typed frontend API client and a self-contained recommendation component embedded in `NewNoteRedesigned.tsx`, where item clicks update the existing `platform` and `url` state.

**Tech Stack:** FastAPI, Pydantic-style JSON response wrapper, Python `requests`, pytest, React 19, TypeScript, Vite, existing VideoMemo design components and CSS variables.

---

## File Structure

- Create `backend/app/services/hot_videos.py`
  - Dataclasses for normalized items and platform results.
  - Platform fetchers.
  - Aggregation, validation, cache, and serialization.
- Create `backend/app/routers/hot_videos.py`
  - `GET /hot_videos` route under the app-wide `/api` prefix.
- Modify `backend/app/__init__.py`
  - Register the new router.
- Create `backend/tests/test_hot_videos_service.py`
  - Service-level tests for mapping, failure isolation, all-platform aggregation, cache, and YouTube parsing.
- Create `backend/tests/test_hot_videos_route.py`
  - FastAPI route tests through `create_app(noop_lifespan)`.
- Create `VideoMemo_frontend/src/services/hotVideos.ts`
  - Typed API client for `/hot_videos`.
- Create `VideoMemo_frontend/src/pages/HomePage/components/HotVideoRecommendations.tsx`
  - Recommendation UI with platform chips, refresh, loading, empty, error, and item states.
- Modify `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`
  - Import and render the component below the source input.
  - Handle recommendation selection by setting `platform`, `url`, and `touchedPf`.

---

### Task 1: Backend Hot Video Domain And Bilibili Mapping

**Files:**
- Create: `backend/app/services/hot_videos.py`
- Create: `backend/tests/test_hot_videos_service.py`

- [ ] **Step 1: Write failing tests for Bilibili mapping**

Add this initial content to `backend/tests/test_hot_videos_service.py`:

```python
from app.services.hot_videos import (
    HotVideoItem,
    PlatformHotVideoResult,
    _map_bilibili_popular_items,
    _format_bilibili_views,
)


def test_format_bilibili_views_uses_chinese_units():
    assert _format_bilibili_views(9999) == "9999播放"
    assert _format_bilibili_views(10000) == "1.0万播放"
    assert _format_bilibili_views(1250000) == "125.0万播放"


def test_map_bilibili_popular_items_normalizes_expected_fields():
    payload = {
        "data": {
            "list": [
                {
                    "bvid": "BV1abc123",
                    "title": "测试热门视频",
                    "pic": "//i0.hdslb.com/bfs/archive/cover.jpg",
                    "owner": {"name": "测试 UP"},
                    "stat": {"view": 123456},
                },
                {
                    "bvid": "",
                    "title": "没有 bvid 的条目会被跳过",
                },
            ]
        }
    }

    items = _map_bilibili_popular_items(payload, limit=5)

    assert items == [
        HotVideoItem(
            id="BV1abc123",
            platform="bilibili",
            title="测试热门视频",
            url="https://www.bilibili.com/video/BV1abc123",
            cover_url="https://i0.hdslb.com/bfs/archive/cover.jpg",
            author="测试 UP",
            rank=1,
            hot_score="12.3万播放",
            source="bilibili_popular",
        )
    ]
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py -q
```

Expected: import failure because `app.services.hot_videos` does not exist.

- [ ] **Step 3: Implement the minimal domain model and Bilibili mapper**

Create `backend/app/services/hot_videos.py`:

```python
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py -q
```

Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/hot_videos.py backend/tests/test_hot_videos_service.py
git commit -m "feat(hot-videos): add normalized Bilibili mapping"
```

---

### Task 2: Backend Fetchers, Aggregation, Partial Failure, And Cache

**Files:**
- Modify: `backend/app/services/hot_videos.py`
- Modify: `backend/tests/test_hot_videos_service.py`

- [ ] **Step 1: Add failing service tests**

Append these tests to `backend/tests/test_hot_videos_service.py`:

```python
import pytest

from app.services import hot_videos
from app.services.hot_videos import fetch_hot_videos, fetch_hot_video_payload


def test_fetch_all_keeps_successful_platform_when_another_platform_fails(monkeypatch):
    def fake_bilibili(limit):
        return PlatformHotVideoResult(
            platform="bilibili",
            status="ok",
            message="",
            items=[
                HotVideoItem(
                    id="BV1ok",
                    platform="bilibili",
                    title="可用热门",
                    url="https://www.bilibili.com/video/BV1ok",
                    rank=1,
                    source="bilibili_popular",
                )
            ],
        )

    def fake_youtube(limit):
        raise RuntimeError("network blocked")

    monkeypatch.setattr(hot_videos, "HOT_FETCHERS", {
        "bilibili": fake_bilibili,
        "youtube": fake_youtube,
    })
    hot_videos.clear_hot_video_cache()

    payload = fetch_hot_video_payload(platform="all", limit=3)

    assert payload["platform"] == "all"
    assert [p["platform"] for p in payload["platforms"]] == ["bilibili", "youtube"]
    assert payload["platforms"][0]["status"] == "ok"
    assert payload["platforms"][0]["items"][0]["title"] == "可用热门"
    assert payload["platforms"][1]["status"] == "error"
    assert "network blocked" in payload["platforms"][1]["message"]


def test_fetch_hot_videos_rejects_unknown_platform():
    with pytest.raises(ValueError, match="不支持的热点平台"):
        fetch_hot_videos(platform="instagram", limit=3)


def test_cache_returns_first_payload_inside_ttl(monkeypatch):
    calls = []

    def fake_bilibili(limit):
        calls.append(limit)
        return PlatformHotVideoResult(
            platform="bilibili",
            status="ok",
            message="",
            items=[
                HotVideoItem(
                    id=f"BV{len(calls)}",
                    platform="bilibili",
                    title=f"第 {len(calls)} 次",
                    url=f"https://www.bilibili.com/video/BV{len(calls)}",
                    rank=1,
                    source="bilibili_popular",
                )
            ],
        )

    monkeypatch.setattr(hot_videos, "HOT_FETCHERS", {"bilibili": fake_bilibili})
    hot_videos.clear_hot_video_cache()

    first = fetch_hot_video_payload(platform="bilibili", limit=1)
    second = fetch_hot_video_payload(platform="bilibili", limit=1)

    assert len(calls) == 1
    assert first == second
    assert second["platforms"][0]["items"][0]["title"] == "第 1 次"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py -q
```

Expected: import failures for `fetch_hot_videos`, `fetch_hot_video_payload`, and `clear_hot_video_cache`.

- [ ] **Step 3: Implement fetchers, aggregation, and cache**

Extend `backend/app/services/hot_videos.py` with:

```python
_CacheEntry = tuple[float, dict[str, Any]]
_CACHE: dict[tuple[str, int], _CacheEntry] = {}


def clear_hot_video_cache() -> None:
    _CACHE.clear()


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.7",
    })
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


def fetch_hot_video_payload(platform: str = "all", limit: int = 12, *, force: bool = False) -> dict[str, Any]:
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
```

- [ ] **Step 4: Add minimal mapper functions required by fetchers**

Append these minimal mapper functions to `backend/app/services/hot_videos.py`; Task 3 will test and strengthen them:

```python
def _map_youtube_trending_html(html: str, limit: int) -> list[HotVideoItem]:
    return []


def _map_douyin_hot_items(payload: dict[str, Any], limit: int) -> list[HotVideoItem]:
    return []
```

- [ ] **Step 5: Run the service tests**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py -q
```

Expected: all current service tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/hot_videos.py backend/tests/test_hot_videos_service.py
git commit -m "feat(hot-videos): aggregate platform hotspot results"
```

---

### Task 3: YouTube And Douyin Parsers

**Files:**
- Modify: `backend/app/services/hot_videos.py`
- Modify: `backend/tests/test_hot_videos_service.py`

- [ ] **Step 1: Add failing parser tests**

Append to `backend/tests/test_hot_videos_service.py`:

```python
from app.services.hot_videos import _map_douyin_hot_items, _map_youtube_trending_html


def test_map_youtube_trending_html_extracts_video_renderers():
    html = """
    <html><script>
    var ytInitialData = {"contents":{"twoColumnBrowseResultsRenderer":{"tabs":[{"tabRenderer":{"content":{"richGridRenderer":{"contents":[{"richItemRenderer":{"content":{"videoRenderer":{"videoId":"abc123XYZ09","title":{"runs":[{"text":"YouTube 热门"}]},"ownerText":{"runs":[{"text":"频道名"}]},"thumbnail":{"thumbnails":[{"url":"https://i.ytimg.com/vi/abc123XYZ09/hqdefault.jpg"}]},"shortViewCountText":{"simpleText":"12万次观看"}}}}}]}}}}]}}};
    </script></html>
    """

    items = _map_youtube_trending_html(html, limit=5)

    assert items[0] == HotVideoItem(
        id="abc123XYZ09",
        platform="youtube",
        title="YouTube 热门",
        url="https://www.youtube.com/watch?v=abc123XYZ09",
        cover_url="https://i.ytimg.com/vi/abc123XYZ09/hqdefault.jpg",
        author="频道名",
        rank=1,
        hot_score="12万次观看",
        source="youtube_trending",
    )


def test_map_douyin_hot_items_extracts_detail_aweme_entries():
    payload = {
        "data": {
            "word_list": [
                {
                    "word": "热点话题",
                    "hot_value": 123456,
                    "aweme_infos": [
                        {
                            "aweme_id": "7123456789012345678",
                            "desc": "抖音热点视频",
                            "author": {"nickname": "创作者"},
                            "video": {"cover": {"url_list": ["https://example.com/cover.jpg"]}},
                        }
                    ],
                }
            ]
        }
    }

    items = _map_douyin_hot_items(payload, limit=5)

    assert items[0] == HotVideoItem(
        id="7123456789012345678",
        platform="douyin",
        title="抖音热点视频",
        url="https://www.douyin.com/video/7123456789012345678",
        cover_url="https://example.com/cover.jpg",
        author="创作者",
        rank=1,
        hot_score="123456热度",
        source="douyin_hot_search",
    )
```

- [ ] **Step 2: Run the parser tests to verify they fail**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py::test_map_youtube_trending_html_extracts_video_renderers backend/tests/test_hot_videos_service.py::test_map_douyin_hot_items_extracts_detail_aweme_entries -q
```

Expected: assertion failures because both mappers return empty lists.

- [ ] **Step 3: Implement YouTube and Douyin parser helpers**

Add imports at the top of `backend/app/services/hot_videos.py`:

```python
import json
import re
```

Replace the minimal mapper functions with:

```python
def _first_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        if isinstance(value.get("simpleText"), str):
            return value["simpleText"].strip()
        runs = value.get("runs")
        if isinstance(runs, list):
            return "".join(str(run.get("text") or "") for run in runs if isinstance(run, dict)).strip()
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


def _map_douyin_hot_items(payload: dict[str, Any], limit: int) -> list[HotVideoItem]:
    items: list[HotVideoItem] = []
    seen: set[str] = set()
    for node in _walk_dicts(payload):
        aweme_id = str(node.get("aweme_id") or node.get("group_id") or "").strip()
        if not re.fullmatch(r"\d{10,}", aweme_id or "") or aweme_id in seen:
            continue
        title = str(node.get("desc") or node.get("title") or node.get("word") or "").strip()
        if not title:
            continue
        seen.add(aweme_id)
        author = node.get("author") if isinstance(node.get("author"), dict) else {}
        video = node.get("video") if isinstance(node.get("video"), dict) else {}
        hot_value = node.get("hot_value") or node.get("view_count") or ""
        items.append(
            HotVideoItem(
                id=aweme_id,
                platform="douyin",
                title=title,
                url=f"https://www.douyin.com/video/{aweme_id}",
                cover_url=_pick_cover_from_node(video),
                author=str(author.get("nickname") or "").strip(),
                rank=len(items) + 1,
                hot_score=f"{hot_value}热度" if hot_value else "",
                source="douyin_hot_search",
            )
        )
        if len(items) >= limit:
            break
    return items
```

- [ ] **Step 4: Run service tests**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py -q
```

Expected: all service tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/hot_videos.py backend/tests/test_hot_videos_service.py
git commit -m "feat(hot-videos): parse YouTube and Douyin sources"
```

---

### Task 4: Backend Hot Videos Route

**Files:**
- Create: `backend/app/routers/hot_videos.py`
- Modify: `backend/app/__init__.py`
- Create: `backend/tests/test_hot_videos_route.py`

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_hot_videos_route.py`:

```python
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import create_app
from app.services.hot_videos import HotVideoItem, PlatformHotVideoResult


@asynccontextmanager
async def noop_lifespan(app: FastAPI):
    yield


def test_hot_videos_route_returns_normalized_payload(monkeypatch):
    from app.routers import hot_videos as route

    def fake_payload(platform="all", limit=12, force=False):
        return {
            "platform": platform,
            "limit": limit,
            "generated_at": "2026-06-08T09:30:00+08:00",
            "platforms": [
                PlatformHotVideoResult(
                    platform="bilibili",
                    status="ok",
                    message="",
                    items=[
                        HotVideoItem(
                            id="BV1route",
                            platform="bilibili",
                            title="路由测试",
                            url="https://www.bilibili.com/video/BV1route",
                            rank=1,
                            source="bilibili_popular",
                        )
                    ],
                ).to_dict()
            ],
        }

    monkeypatch.setattr(route, "fetch_hot_video_payload", fake_payload)
    app = create_app(lifespan=noop_lifespan)
    client = TestClient(app)

    response = client.get("/api/hot_videos?platform=bilibili&limit=3")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["platform"] == "bilibili"
    assert body["data"]["limit"] == 3
    assert body["data"]["platforms"][0]["items"][0]["url"] == "https://www.bilibili.com/video/BV1route"


def test_hot_videos_route_returns_business_error_for_invalid_platform(monkeypatch):
    from app.routers import hot_videos as route

    def fake_payload(platform="all", limit=12, force=False):
        raise ValueError("不支持的热点平台: instagram")

    monkeypatch.setattr(route, "fetch_hot_video_payload", fake_payload)
    app = create_app(lifespan=noop_lifespan)
    client = TestClient(app)

    response = client.get("/api/hot_videos?platform=instagram")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 400
    assert "不支持的热点平台" in body["msg"]
```

- [ ] **Step 2: Run route tests to verify they fail**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_route.py -q
```

Expected: import failure because `app.routers.hot_videos` does not exist or route is not registered.

- [ ] **Step 3: Implement the route**

Create `backend/app/routers/hot_videos.py`:

```python
from fastapi import APIRouter, Query

from app.services.hot_videos import fetch_hot_video_payload
from app.utils.response import ResponseWrapper as R

router = APIRouter()


@router.get("/hot_videos")
def get_hot_videos(
    platform: str = Query("all"),
    limit: int = Query(12, ge=1, le=30),
    force: bool = Query(False),
):
    try:
        return R.success(fetch_hot_video_payload(platform=platform, limit=limit, force=force))
    except ValueError as exc:
        return R.error(msg=str(exc), code=400)
    except Exception as exc:
        return R.error(msg=f"热点视频获取失败: {exc}")
```

- [ ] **Step 4: Register the router**

Modify `backend/app/__init__.py`:

```python
def create_app(lifespan) -> FastAPI:
    from .routers import note, provider, model, config, chat, flashcard, hot_videos
    from .utils.response import ResponseWrapper as R

    app = FastAPI(title="VideoMemo", lifespan=lifespan)

    @app.get("/sys_check")
    async def root_sys_check():
        return R.success()

    app.include_router(note.router, prefix="/api")
    app.include_router(provider.router, prefix="/api")
    app.include_router(model.router, prefix="/api")
    app.include_router(config.router, prefix="/api")
    app.include_router(chat.router, prefix="/api")
    app.include_router(flashcard.router, prefix="/api")
    app.include_router(hot_videos.router, prefix="/api")

    return app
```

- [ ] **Step 5: Run route and service tests**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py backend/tests/test_hot_videos_route.py -q
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/__init__.py backend/app/routers/hot_videos.py backend/tests/test_hot_videos_route.py
git commit -m "feat(hot-videos): expose recommendations API"
```

---

### Task 5: Frontend Hot Videos Service Client

**Files:**
- Create: `VideoMemo_frontend/src/services/hotVideos.ts`

- [ ] **Step 1: Create the typed frontend API client**

Create `VideoMemo_frontend/src/services/hotVideos.ts`:

```ts
import request from '@/utils/request'

export type HotVideoPlatform =
  | 'all'
  | 'bilibili'
  | 'youtube'
  | 'douyin'
  | 'kuaishou'
  | 'xiaohongshu'

export type HotVideoItemPlatform = Exclude<HotVideoPlatform, 'all'>
export type HotVideoStatus = 'ok' | 'error' | 'unavailable'

export interface HotVideoItem {
  id: string
  platform: HotVideoItemPlatform
  title: string
  url: string
  cover_url?: string
  author?: string
  rank?: number
  hot_score?: string
  source?: string
}

export interface HotVideoPlatformResult {
  platform: HotVideoItemPlatform
  status: HotVideoStatus
  message: string
  items: HotVideoItem[]
}

export interface HotVideosResponse {
  platform: HotVideoPlatform
  limit: number
  generated_at: string
  platforms: HotVideoPlatformResult[]
}

export const listHotVideos = async (
  platform: HotVideoPlatform = 'all',
  limit = 12,
  force = false,
): Promise<HotVideosResponse> => {
  return await request.get('/hot_videos', {
    params: { platform, limit, force },
    suppressToast: true,
  })
}
```

- [ ] **Step 2: Run TypeScript build**

Run:

```bash
npm run build
```

Working directory: `VideoMemo_frontend`.

Expected: build succeeds. If unrelated existing frontend errors appear, record them before changing anything else.

- [ ] **Step 3: Commit**

```bash
git add VideoMemo_frontend/src/services/hotVideos.ts
git commit -m "feat(frontend): add hot videos API client"
```

---

### Task 6: Frontend Hot Video Recommendations Component

**Files:**
- Create: `VideoMemo_frontend/src/pages/HomePage/components/HotVideoRecommendations.tsx`

- [ ] **Step 1: Create the recommendation component**

Create `VideoMemo_frontend/src/pages/HomePage/components/HotVideoRecommendations.tsx`:

```tsx
import { FC, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Flame, AlertCircle } from 'lucide-react'
import {
  listHotVideos,
} from '@/services/hotVideos'
import type {
  HotVideoItem,
  HotVideoItemPlatform,
  HotVideoPlatform,
  HotVideoPlatformResult,
} from '@/services/hotVideos'
import { Pf, PLATFORMS } from '@/components/design/PlatformAvatar'
import { useVmLang } from '@/i18n/redesign'

const FILTERS: Array<{ value: HotVideoPlatform; zh: string; en: string }> = [
  { value: 'all', zh: '全部', en: 'All' },
  { value: 'bilibili', zh: 'B 站', en: 'Bilibili' },
  { value: 'youtube', zh: 'YouTube', en: 'YouTube' },
  { value: 'douyin', zh: '抖音', en: 'Douyin' },
  { value: 'kuaishou', zh: '快手', en: 'Kuaishou' },
  { value: 'xiaohongshu', zh: '小红书', en: 'RED' },
]

const DEFAULT_MESSAGES: Record<HotVideoItemPlatform, string> = {
  bilibili: 'B 站热点暂时获取失败',
  youtube: 'YouTube 热点暂时获取失败',
  douyin: '抖音热点受风控限制，稍后刷新或手动粘贴链接',
  kuaishou: '快手热点暂时获取失败，可手动粘贴链接',
  xiaohongshu: '小红书暂未提供稳定公开视频热点源',
}

export interface HotVideoRecommendationsProps {
  onSelect: (item: HotVideoItem) => void
}

const HotVideoRecommendations: FC<HotVideoRecommendationsProps> = ({ onSelect }) => {
  const lang = useVmLang()
  const [active, setActive] = useState<HotVideoPlatform>('all')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<HotVideoPlatformResult[]>([])
  const [error, setError] = useState('')

  const load = async (platform: HotVideoPlatform, force = false) => {
    setLoading(true)
    setError('')
    try {
      const data = await listHotVideos(platform, 12, force)
      setResults(data.platforms || [])
    } catch (e: any) {
      setResults([])
      setError(e?.msg || (lang === 'zh' ? '热点推荐暂时不可用' : 'Recommendations unavailable'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(active)
  }, [active])

  const items = useMemo(
    () => results.flatMap(result => (result.status === 'ok' ? result.items : [])),
    [results],
  )
  const notices = useMemo(
    () => results.filter(result => result.status !== 'ok'),
    [results],
  )

  return (
    <div style={{ marginTop: 14, borderTop: '1px solid var(--vm-border)', paddingTop: 14 }}>
      <div className="vm-row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="vm-row" style={{ gap: 8 }}>
          <span style={{ color: 'var(--vm-primary)', display: 'grid' }}>
            <Flame size={16} />
          </span>
          <div style={{ fontWeight: 800, fontSize: 14 }}>
            {lang === 'zh' ? '热点推荐' : 'Trending videos'}
          </div>
        </div>
        <button
          type="button"
          className="vm-btn vm-btn-ghost vm-btn-sm"
          onClick={() => load(active, true)}
          disabled={loading}
          title={lang === 'zh' ? '刷新热点推荐' : 'Refresh recommendations'}
          style={{ width: 34, paddingInline: 0 }}
        >
          <RefreshCw size={15} />
        </button>
      </div>

      <div className="vm-chip-row" style={{ marginBottom: 12 }}>
        {FILTERS.map(filter => (
          <button
            key={filter.value}
            type="button"
            className={'vm-chip' + (active === filter.value ? ' on' : '')}
            onClick={() => setActive(filter.value)}
          >
            {filter[lang]}
          </button>
        ))}
      </div>

      <div style={{ minHeight: 132 }}>
        {loading ? (
          <div className="vm-field-hint" style={{ padding: '22px 0' }}>
            {lang === 'zh' ? '正在获取热点视频…' : 'Loading trending videos…'}
          </div>
        ) : error ? (
          <div className="vm-badge vm-badge-warn" style={{ borderRadius: 'var(--vm-radius-sm)' }}>
            <AlertCircle size={15} /> {error}
          </div>
        ) : (
          <>
            {items.length > 0 ? (
              <div style={{ display: 'grid', gap: 8 }}>
                {items.map(item => (
                  <HotVideoRow key={`${item.platform}:${item.id}`} item={item} onSelect={onSelect} />
                ))}
              </div>
            ) : (
              <div className="vm-field-hint" style={{ padding: '18px 0' }}>
                {lang === 'zh' ? '暂无可展示的热点视频，可手动粘贴链接。' : 'No recommendations available. Paste a link manually.'}
              </div>
            )}
            {notices.length > 0 && (
              <div style={{ display: 'grid', gap: 6, marginTop: 10 }}>
                {notices.map(result => (
                  <div key={result.platform} className="vm-field-hint">
                    {PLATFORMS[result.platform]?.[lang] || result.platform}：{result.message || DEFAULT_MESSAGES[result.platform]}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const HotVideoRow: FC<{ item: HotVideoItem; onSelect: (item: HotVideoItem) => void }> = ({
  item,
  onSelect,
}) => {
  const lang = useVmLang()
  const meta = [item.author, item.hot_score].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      title={item.title}
      style={{
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1fr)',
        gap: 10,
        width: '100%',
        padding: 8,
        textAlign: 'left',
        border: '1px solid var(--vm-border)',
        borderRadius: 'var(--vm-radius-sm)',
        background: 'var(--vm-surface)',
        cursor: 'pointer',
      }}
    >
      <div
        style={{
          width: 64,
          height: 42,
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--vm-surface-2)',
          position: 'relative',
        }}
      >
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
            <Pf id={item.platform} sm />
          </div>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="vm-row" style={{ gap: 7, marginBottom: 4 }}>
          <Pf id={item.platform} sm />
          <span className="vm-field-hint">
            #{item.rank || '-'} · {PLATFORMS[item.platform]?.[lang] || item.platform}
          </span>
        </div>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--vm-text)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.title}
        </div>
        {meta && (
          <div
            className="vm-field-hint"
            style={{ marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {meta}
          </div>
        )}
      </div>
    </button>
  )
}

export default HotVideoRecommendations
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
npm run build
```

Working directory: `VideoMemo_frontend`.

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add VideoMemo_frontend/src/pages/HomePage/components/HotVideoRecommendations.tsx
git commit -m "feat(frontend): add hot video recommendations component"
```

---

### Task 7: Embed Recommendations In New Note Form

**Files:**
- Modify: `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`

- [ ] **Step 1: Import the component and item type**

Modify imports in `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`:

```tsx
import HotVideoRecommendations from '@/pages/HomePage/components/HotVideoRecommendations'
import type { HotVideoItem } from '@/services/hotVideos'
```

- [ ] **Step 2: Add selection handler inside `NewNoteRedesigned`**

Place this near `const detectedShow = !!detectPlatform(url)`:

```tsx
  const handleHotVideoSelect = (item: HotVideoItem) => {
    setPlatform(item.platform)
    setUrl(item.url)
    setTouchedPf(true)
    setShowHist(false)
    toast.success(lang === 'zh' ? '已填入热点视频链接' : 'Trending video selected')
  }
```

- [ ] **Step 3: Render recommendations under the source input**

Inside the first source card, after the `platform === 'local'` upload block, render only for non-local platforms:

```tsx
        {platform !== 'local' && <HotVideoRecommendations onSelect={handleHotVideoSelect} />}
```

The recommendation component should sit inside the existing source card so the input remains visually connected to the suggestions.

- [ ] **Step 4: Run frontend build**

Run:

```bash
npm run build
```

Working directory: `VideoMemo_frontend`.

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx
git commit -m "feat(frontend): wire hot recommendations into note form"
```

---

### Task 8: Integration Verification And Runtime Check

**Files:**
- No planned source edits unless verification exposes a real defect.

- [ ] **Step 1: Run backend hotspot tests**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_hot_videos_service.py backend/tests/test_hot_videos_route.py -q
```

Expected: all tests pass.

- [ ] **Step 2: Run existing Douyin regression tests**

Run:

```bash
backend/.venv/bin/python -m pytest backend/tests/test_douyin_downloader.py -q
```

Expected: all tests pass.

- [ ] **Step 3: Build frontend**

Run:

```bash
npm run build
```

Working directory: `VideoMemo_frontend`.

Expected: build succeeds.

- [ ] **Step 4: Start backend from current source**

If port `8483` is already occupied by an old packaged app, stop that old process first. Then run:

```bash
.venv/bin/python main.py
```

Working directory: `backend`.

Expected: logs show `Uvicorn running on http://0.0.0.0:8483`.

- [ ] **Step 5: Start frontend**

Run:

```bash
npm run dev
```

Working directory: `VideoMemo_frontend`.

Expected: Vite reports `Local: http://localhost:3015/`.

- [ ] **Step 6: Verify API manually**

Run:

```bash
curl -s 'http://127.0.0.1:8483/api/hot_videos?platform=all&limit=3'
```

Expected: JSON with `code: 0`, `data.platforms`, and platform-level `status` fields. It is acceptable for Douyin, Kuaishou, or Xiaohongshu to return `error` or `unavailable`; at least one platform should be represented in the response.

- [ ] **Step 7: Verify browser behavior**

Open `http://localhost:3015/` in the in-app browser.

Expected checks:

- The new note form shows `热点推荐` under the video source input.
- Platform chips switch the recommendation request.
- Refresh calls the API again.
- Clicking a recommendation fills the URL field and switches the platform.
- Clicking `生成笔记` starts the existing note-generation flow using that selected URL.

- [ ] **Step 8: Final git status**

Run:

```bash
git status --short
```

Expected: only unrelated untracked `AGENTS.md` remains, or a clean tree if the user chose to track it separately. Do not stage `AGENTS.md` unless explicitly instructed.

- [ ] **Step 9: Push**

Run:

```bash
git push origin main
```

Expected: push succeeds.
