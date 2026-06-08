import sys
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
    _map_douyin_hot_items,
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
