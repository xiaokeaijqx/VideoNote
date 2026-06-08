import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.hot_videos import (
    HotVideoItem,
    PlatformHotVideoResult,
    _format_bilibili_views,
    _map_bilibili_popular_items,
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
