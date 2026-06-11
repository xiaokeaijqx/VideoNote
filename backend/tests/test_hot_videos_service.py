import sys
import threading
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import hot_videos
from app.services.hot_videos import (
    HotVideoItem,
    PlatformHotVideoResult,
    _format_bilibili_views,
    _fetch_bilibili_hot,
    _map_douyin_hot_items,
    _map_bilibili_reader_markdown_items,
    _map_bilibili_popular_items,
    _map_youtube_trending_html,
    fetch_hot_video_payload,
    fetch_hot_videos,
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


def test_map_bilibili_reader_markdown_items_extracts_popular_page_links():
    markdown = """
[![Image 1](https://i1.hdslb.com/bfs/archive/cover.jpg@412w_232h_1c_!web-popular.avif)](https://www.bilibili.com/video/BV1xkE46PE59)

参加了九次高考的考生采访

自来卷三木

275.2万  1847
"""

    items = _map_bilibili_reader_markdown_items(markdown, limit=3)

    assert items == [
        HotVideoItem(
            id="BV1xkE46PE59",
            platform="bilibili",
            title="参加了九次高考的考生采访",
            url="https://www.bilibili.com/video/BV1xkE46PE59",
            cover_url="https://i1.hdslb.com/bfs/archive/cover.jpg@412w_232h_1c_!web-popular.avif",
            author="自来卷三木",
            rank=1,
            hot_score="275.2万播放",
            source="bilibili_popular_reader",
        )
    ]


def test_fetch_bilibili_hot_falls_back_to_reader_when_api_fails(monkeypatch):
    markdown = """
[![Image 1](https://i1.hdslb.com/bfs/archive/cover.jpg)](https://www.bilibili.com/video/BV1xkE46PE59)

参加了九次高考的考生采访

自来卷三木

275.2万  1847
"""

    class FakeResponse:
        text = markdown

        def raise_for_status(self):
            return None

    class FakeSession:
        headers = {}

        def __init__(self):
            self.calls = []

        def get(self, url, **kwargs):
            self.calls.append(url)
            if "api.bilibili.com" in url:
                raise RuntimeError("tls eof")
            return FakeResponse()

    session = FakeSession()
    monkeypatch.setattr(hot_videos, "_session", lambda: session)

    result = _fetch_bilibili_hot(limit=2)

    assert result.status == "ok"
    assert result.message == "官方热点接口暂不可用，已切换备用热点源"
    assert result.items[0].source == "bilibili_popular_reader"
    assert result.items[0].url == "https://www.bilibili.com/video/BV1xkE46PE59"
    assert any("api.bilibili.com" in call for call in session.calls)
    assert any("r.jina.ai" in call for call in session.calls)


def test_fetch_bilibili_hot_uses_snapshot_when_live_sources_fail(monkeypatch):
    class FakeSession:
        headers = {}

        def get(self, url, **kwargs):
            raise RuntimeError(f"blocked: {url}")

    monkeypatch.setattr(hot_videos, "_session", lambda: FakeSession())

    result = _fetch_bilibili_hot(limit=2)

    assert result.status == "ok"
    assert result.message == "实时热点源暂不可用，已显示最近热门快照"
    assert len(result.items) == 2
    assert {item.platform for item in result.items} == {"bilibili"}
    assert {item.source for item in result.items} == {"bilibili_popular_snapshot"}
    assert all(item.url.startswith("https://www.bilibili.com/video/BV") for item in result.items)


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

    monkeypatch.setattr(
        hot_videos,
        "HOT_FETCHERS",
        {
            "bilibili": fake_bilibili,
            "youtube": fake_youtube,
        },
    )
    hot_videos.clear_hot_video_cache()

    payload = fetch_hot_video_payload(platform="all", limit=3)

    assert payload["platform"] == "all"
    assert [p["platform"] for p in payload["platforms"]] == ["bilibili", "youtube"]
    assert payload["platforms"][0]["status"] == "ok"
    assert payload["platforms"][0]["items"][0]["title"] == "可用热门"
    assert payload["platforms"][1]["status"] == "error"
    assert "network blocked" in payload["platforms"][1]["message"]


def test_fetch_all_runs_platform_fetchers_concurrently(monkeypatch):
    lock = threading.Lock()
    started: list[str] = []
    both_started = threading.Event()

    def make_fetcher(name: str):
        def fake_fetcher(limit):
            with lock:
                started.append(name)
                if len(started) == 2:
                    both_started.set()
            if not both_started.wait(timeout=1):
                raise AssertionError("platform fetchers did not overlap")
            return PlatformHotVideoResult(
                platform=name,
                status="ok",
                message="",
                items=[
                    HotVideoItem(
                        id=f"{name}-1",
                        platform=name,
                        title=f"{name} 热点",
                        url=f"https://example.com/{name}",
                        rank=1,
                    )
                ],
            )

        return fake_fetcher

    monkeypatch.setattr(
        hot_videos,
        "HOT_FETCHERS",
        {
            "bilibili": make_fetcher("bilibili"),
            "youtube": make_fetcher("youtube"),
        },
    )
    hot_videos.clear_hot_video_cache()

    payload = fetch_hot_video_payload(platform="all", limit=1, force=True)

    assert [item["status"] for item in payload["platforms"]] == ["ok", "ok"]
    assert [item["platform"] for item in payload["platforms"]] == ["bilibili", "youtube"]


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


def test_fetch_newsnow_hot_maps_correctly(monkeypatch):
    from app.services.hot_videos import _fetch_newsnow_hot

    mock_payload = {
        "status": "cache",
        "id": "zhihu",
        "items": [
            {
                "id": "12345",
                "title": "测试知乎标题",
                "url": "https://zhihu.com/question/12345",
                "author": "知乎网友",
                "extra": {"info": "100万热度"},
            },
            {
                "id": "67890",
                "title": "",  # empty title should be skipped
                "url": "https://zhihu.com/question/67890",
            },
        ],
    }

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return mock_payload

    class FakeSession:
        headers = {}

        def get(self, url, params=None, **kwargs):
            assert "newsnow" in url
            assert params == {"id": "zhihu"}
            return FakeResponse()

    monkeypatch.setattr(hot_videos, "_session", lambda: FakeSession())

    result = _fetch_newsnow_hot("zhihu", limit=5)
    assert result.status == "ok"
    assert result.platform == "zhihu"
    assert len(result.items) == 1
    assert result.items[0] == HotVideoItem(
        id="12345",
        platform="zhihu",
        title="测试知乎标题",
        url="https://zhihu.com/question/12345",
        cover_url="",
        author="知乎网友",
        rank=1,
        hot_score="100万热度",
        source="newsnow",
    )


def test_fetch_newsnow_hot_handles_failure(monkeypatch):
    from app.services.hot_videos import _fetch_newsnow_hot

    class FakeSession:
        headers = {}

        def get(self, url, params=None, **kwargs):
            raise RuntimeError("API timeout")

    monkeypatch.setattr(hot_videos, "_session", lambda: FakeSession())

    result = _fetch_newsnow_hot("zhihu", limit=5)
    assert result.status == "error"
    assert "API timeout" in result.message
    assert len(result.items) == 0

