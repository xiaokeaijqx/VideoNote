import json
import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.downloaders import douyin_downloader
from app.downloaders.douyin_downloader import DouyinDownloader, DouyinResolveError


AWEME_ID = "7345492945006595379"
VIDEO_ID = "v0200fg10000cq123abc"


def _router_html(item: dict) -> str:
    payload = {"loaderData": {"anything": {"item_list": [item]}}}
    return (
        "<html><body><script>"
        f"window._ROUTER_DATA = {json.dumps(payload, ensure_ascii=False)};"
        "</script></body></html>"
    )


def _video_item() -> dict:
    return {
        "aweme_id": AWEME_ID,
        "desc": "测试视频 #知识",
        "duration": 123456,
        "author": {"nickname": "作者A"},
        "video": {
            "play_addr": {
                "uri": VIDEO_ID,
                "url_list": ["https://example.com/playwm/?video_id=watermarked"],
            },
            "cover": {"url_list": ["https://example.com/cover.jpg"]},
        },
        "text_extra": [{"hashtag_name": "知识"}],
    }


class DummyResponse:
    def __init__(
        self,
        *,
        text="",
        content=b"",
        url="https://www.iesdouyin.com/share/video/1/",
    ):
        self.text = text
        self.content = content
        self.url = url
        self.status_code = 200

    def raise_for_status(self):
        return None

    def iter_content(self, chunk_size=8192):
        yield self.content

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


def test_expand_share_url_extracts_douyin_url_from_share_text():
    share_text = (
        "7.43 复制打开抖音，看看这个视频 "
        "https://v.douyin.com/abc123/ 复制此链接，打开Dou音搜索"
    )

    assert douyin_downloader.expand_share_url(share_text) == "https://v.douyin.com/abc123"


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (
            f"https://www.douyin.com/video/{AWEME_ID}",
            f"https://www.iesdouyin.com/share/video/{AWEME_ID}/",
        ),
        (
            f"https://www.douyin.com/note/{AWEME_ID}",
            f"https://www.iesdouyin.com/share/note/{AWEME_ID}/",
        ),
    ],
)
def test_normalize_to_share_page_converts_www_video_and_note_urls(url, expected):
    assert douyin_downloader.normalize_to_share_page(url) == expected


def test_parse_share_page_html_reads_router_data_video_metadata():
    html = _router_html(_video_item())

    meta = douyin_downloader.parse_share_page_html(
        html,
        f"https://www.iesdouyin.com/share/video/{AWEME_ID}/",
        "https://v.douyin.com/abc123",
    )

    assert meta.aweme_id == AWEME_ID
    assert meta.title == "测试视频 #知识"
    assert meta.author == "作者A"
    assert meta.cover_url == "https://example.com/cover.jpg"
    assert meta.duration == pytest.approx(123.456)
    assert meta.download_url == (
        f"https://aweme.snssdk.com/aweme/v1/play/?video_id={VIDEO_ID}&ratio=720p&line=0"
    )
    assert meta.tags == ["知识"]


def test_parse_share_page_html_raises_actionable_error_without_ssr_data():
    with pytest.raises(DouyinResolveError, match="分享页未找到"):
        douyin_downloader.parse_share_page_html(
            "<html></html>",
            f"https://www.iesdouyin.com/share/video/{AWEME_ID}/",
            "https://v.douyin.com/abc123",
        )


def test_downloader_download_uses_share_page_video_and_extracts_audio(
    monkeypatch, tmp_path: Path
):
    html = _router_html(_video_item())

    class DummySession:
        headers = {}

        def get(self, url, allow_redirects=True, timeout=30):
            assert url == "https://v.douyin.com/abc123"
            return DummyResponse(
                text=html,
                url=f"https://www.iesdouyin.com/share/video/{AWEME_ID}/",
            )

    requested_urls = []

    def fake_session():
        return DummySession()

    def fake_get(url, headers=None, stream=False, timeout=None, **kwargs):
        requested_urls.append(url)
        return DummyResponse(content=b"fake mp4")

    def fake_run(cmd, check, stdout, stderr):
        output_path = Path(cmd[-1])
        output_path.write_bytes(b"fake mp3")

    monkeypatch.setattr(douyin_downloader, "_session", fake_session)
    monkeypatch.setattr(douyin_downloader.requests, "get", fake_get)
    monkeypatch.setattr(douyin_downloader.subprocess, "run", fake_run)

    result = DouyinDownloader().download(
        "https://v.douyin.com/abc123/",
        output_dir=str(tmp_path),
    )

    assert result.video_id == AWEME_ID
    assert result.platform == "douyin"
    assert result.title == "测试视频 #知识"
    assert result.duration == pytest.approx(123.456)
    assert result.cover_url == "https://example.com/cover.jpg"
    assert result.raw_info["tags"] == ["知识"]
    assert Path(result.file_path).read_bytes() == b"fake mp3"
    assert Path(result.video_path).read_bytes() == b"fake mp4"
    assert requested_urls == [
        f"https://aweme.snssdk.com/aweme/v1/play/?video_id={VIDEO_ID}&ratio=720p&line=0"
    ]
