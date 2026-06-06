from __future__ import annotations

import json
import os
import re
import subprocess
from dataclasses import dataclass, field
from typing import Any, Literal, Optional, Union
from urllib.parse import unquote

import requests

from app.downloaders.base import Downloader
from app.enmus.note_enums import DownloadQuality
from app.models.audio_model import AudioDownloadResult
from app.models.transcriber_model import TranscriptResult, TranscriptSegment
from app.utils.path_helper import get_data_dir


SHARE_PAGE_UA = (
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.0 Mobile/15E148 Safari/604.1"
)

ROUTER_DATA_RE = re.compile(r"window\._ROUTER_DATA\s*=\s*(\{.+)", re.DOTALL)
RENDER_DATA_RE = re.compile(
    r'<script id="RENDER_DATA" type="application/json">([^<]+)</script>'
)
DOUYIN_URL_RE = re.compile(
    r"https?://(?:v\.douyin\.com|www\.douyin\.com|www\.iesdouyin\.com|m\.douyin\.com)[^\s\]]*"
)
IMAGE_AWEME_TYPES = {2, 68}


class DouyinResolveError(Exception):
    pass


@dataclass
class DouyinContentMeta:
    aweme_id: str
    title: str
    author: str
    source_url: str
    content_type: Literal["video", "image"] = "video"
    aweme_type: Optional[int] = None
    download_url: str = ""
    cover_url: Optional[str] = None
    image_urls: list[str] = field(default_factory=list)
    duration: float = 0
    tags: list[str] = field(default_factory=list)


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": SHARE_PAGE_UA,
            "Accept-Language": "zh-CN,zh;q=0.9",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        }
    )
    return session


def expand_share_url(share_text: str) -> str:
    """从抖音分享文案中提取可访问链接。"""
    match = DOUYIN_URL_RE.search((share_text or "").strip())
    if not match:
        raise DouyinResolveError("未在输入中找到抖音链接")
    return match.group(0).rstrip("/.,;)")


def normalize_to_share_page(url: str) -> str:
    """www.douyin.com 的 video/note 页面转为移动端分享页。"""
    note = re.search(r"https?://(?:www\.)?douyin\.com/note/(\d+)", url)
    if note:
        return f"https://www.iesdouyin.com/share/note/{note.group(1)}/"
    video = re.search(r"https?://(?:www\.)?douyin\.com/video/(\d+)", url)
    if video:
        return f"https://www.iesdouyin.com/share/video/{video.group(1)}/"
    return url


def resolve_share_page(session: requests.Session, share_url: str) -> tuple[str, str]:
    response = session.get(share_url, allow_redirects=True, timeout=30)
    response.raise_for_status()
    return str(response.url), response.text


def extract_aweme_id(page_url: str, html: Optional[str] = None) -> str:
    patterns = [
        r"/video/(\d+)",
        r"/note/(\d+)",
        r"/share/video/(\d+)",
        r"/share/note/(\d+)",
        r"modal_id=(\d+)",
        r"item_ids=(\d+)",
        r'"aweme_id"\s*:\s*"?(\d+)"?',
        r'"itemId"\s*:\s*"?(\d+)"?',
    ]
    for pattern in patterns:
        match = re.search(pattern, page_url)
        if match:
            return match.group(1)
    if html:
        for pattern in patterns:
            match = re.search(pattern, html)
            if match:
                return match.group(1)
    raise DouyinResolveError(f"无法从分享页解析作品 ID: {page_url}")


def _parse_router_data(html: str) -> Optional[dict[str, Any]]:
    match = ROUTER_DATA_RE.search(html)
    if not match:
        return None
    raw = match.group(1).split("</script>")[0].rstrip().rstrip(";")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return None


def _parse_render_data(html: str) -> Optional[dict[str, Any]]:
    match = RENDER_DATA_RE.search(html)
    if not match:
        return None
    try:
        return json.loads(unquote(match.group(1)))
    except json.JSONDecodeError:
        return None


def _find_item_list(obj: Any) -> list[dict[str, Any]]:
    if isinstance(obj, dict):
        item_list = obj.get("item_list")
        if isinstance(item_list, list) and item_list:
            first = item_list[0]
            if isinstance(first, dict) and (
                "aweme_id" in first or "awemeId" in first or "video" in first or "images" in first
            ):
                return item_list
        for value in obj.values():
            found = _find_item_list(value)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = _find_item_list(item)
            if found:
                return found
    return []


def _pick_url_from_image_node(image: dict[str, Any]) -> Optional[str]:
    url_list = image.get("url_list") or []
    if url_list:
        return str(url_list[-1])
    download_list = image.get("download_url_list") or []
    if download_list:
        return str(download_list[-1])
    return None


def _extract_image_urls(item: dict[str, Any]) -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()

    def add(url: Optional[str]) -> None:
        if url and url not in seen:
            seen.add(url)
            urls.append(url)

    for image in item.get("images") or []:
        if isinstance(image, dict):
            add(_pick_url_from_image_node(image))

    post = item.get("image_post_info") or {}
    if isinstance(post, dict):
        for image in post.get("images") or []:
            if isinstance(image, dict):
                add(_pick_url_from_image_node(image))

    return urls


def _has_playable_video(item: dict[str, Any]) -> bool:
    video = item.get("video") or {}
    if not isinstance(video, dict):
        return False
    play_addr = video.get("play_addr") or video.get("playAddr") or {}
    if not isinstance(play_addr, dict):
        return False
    return bool(play_addr.get("uri") or play_addr.get("url_list"))


def _is_image_note(item: dict[str, Any]) -> bool:
    aweme_type = item.get("aweme_type")
    if aweme_type in IMAGE_AWEME_TYPES:
        return True
    return bool(_extract_image_urls(item)) and not _has_playable_video(item)


def _build_no_watermark_url(play_addr: dict[str, Any]) -> str:
    uri = play_addr.get("uri") or ""
    url_list = play_addr.get("url_list") or []
    if uri:
        return f"https://aweme.snssdk.com/aweme/v1/play/?video_id={uri}&ratio=720p&line=0"
    if url_list:
        return str(url_list[0]).replace("playwm", "play")
    raise DouyinResolveError("分享页内嵌数据中未找到视频播放地址")


def _extract_tags(item: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for tag in item.get("text_extra") or item.get("video_tag") or []:
        if not isinstance(tag, dict):
            continue
        name = tag.get("hashtag_name") or tag.get("tag_name") or tag.get("name")
        if name and name not in seen:
            seen.add(name)
            tags.append(str(name))
    return tags


def _duration_seconds(raw: Any) -> float:
    try:
        value = float(raw or 0)
    except (TypeError, ValueError):
        return 0
    return value / 1000 if value > 10000 else value


def _meta_from_aweme_item(item: dict[str, Any], source_url: str) -> DouyinContentMeta:
    aweme_id = str(item.get("aweme_id") or item.get("awemeId") or "")
    title = (item.get("desc") or item.get("caption") or "").strip() or f"douyin_{aweme_id}"
    aweme_type = item.get("aweme_type")
    tags = _extract_tags(item)

    author = ""
    author_info = item.get("author") or {}
    if isinstance(author_info, dict):
        author = author_info.get("nickname") or author_info.get("unique_id") or ""

    duration = _duration_seconds(item.get("duration"))

    if _is_image_note(item):
        image_urls = _extract_image_urls(item)
        if not image_urls:
            raise DouyinResolveError("识别为图文，但未找到图片地址")
        return DouyinContentMeta(
            aweme_id=aweme_id,
            title=title,
            author=author,
            source_url=source_url,
            content_type="image",
            aweme_type=aweme_type,
            cover_url=image_urls[0],
            image_urls=image_urls,
            duration=duration,
            tags=tags,
        )

    video = item.get("video") or {}
    if not isinstance(video, dict):
        raise DouyinResolveError("分享页内嵌数据中未找到视频节点")
    play_addr = video.get("play_addr") or video.get("playAddr") or {}
    if not isinstance(play_addr, dict):
        raise DouyinResolveError("视频节点缺少 play_addr")

    download_url = _build_no_watermark_url(play_addr)
    cover_url = None
    for key in ("cover", "origin_cover", "dynamic_cover", "cover_original_scale"):
        cover_info = video.get(key) or {}
        if isinstance(cover_info, dict):
            covers = cover_info.get("url_list") or []
            if covers:
                cover_url = str(covers[0])
                break

    for bit_rate in video.get("bit_rate") or []:
        if not isinstance(bit_rate, dict):
            continue
        bit_play = bit_rate.get("play_addr") or {}
        if isinstance(bit_play, dict) and bit_play.get("url_list"):
            candidate = str(bit_play["url_list"][0])
            if "playwm" not in candidate and ("douyinvod" in candidate or "bytecdn" in candidate):
                download_url = candidate
                break

    return DouyinContentMeta(
        aweme_id=aweme_id,
        title=title,
        author=author,
        source_url=source_url,
        content_type="video",
        aweme_type=aweme_type,
        download_url=download_url,
        cover_url=cover_url,
        duration=duration,
        tags=tags,
    )


def parse_share_page_html(html: str, page_url: str, original_share: str) -> DouyinContentMeta:
    for parser in (_parse_router_data, _parse_render_data):
        payload = parser(html)
        if not payload:
            continue
        items = _find_item_list(payload)
        if items:
            meta = _meta_from_aweme_item(items[0], original_share)
            if meta.aweme_id:
                return meta
            return DouyinContentMeta(
                aweme_id=extract_aweme_id(page_url, html),
                title=meta.title,
                author=meta.author,
                source_url=meta.source_url,
                content_type=meta.content_type,
                aweme_type=meta.aweme_type,
                download_url=meta.download_url,
                cover_url=meta.cover_url,
                image_urls=meta.image_urls,
                duration=meta.duration,
                tags=meta.tags,
            )

    raise DouyinResolveError(
        "分享页未找到内嵌公开数据（_ROUTER_DATA / RENDER_DATA）。"
        "请确认链接有效。"
    )


def resolve_douyin_share(share_text: str) -> DouyinContentMeta:
    session = _session()
    share_url = expand_share_url(share_text)
    fetch_url = normalize_to_share_page(share_url)
    page_url, html = resolve_share_page(session, fetch_url)
    return parse_share_page_html(html, page_url, share_url)


def _download_file(url: str, dest: str) -> str:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    headers = {"User-Agent": SHARE_PAGE_UA, "Referer": "https://www.iesdouyin.com/"}
    with requests.get(url, headers=headers, stream=True, timeout=120) as response:
        response.raise_for_status()
        with open(dest, "wb") as file:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    file.write(chunk)
    return dest


def _extract_audio(video_path: str, audio_path: str) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-i", video_path, "-vn", "-acodec", "libmp3lame", audio_path],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _build_result(
    meta: DouyinContentMeta,
    audio_path: str,
    video_path: Optional[str],
) -> AudioDownloadResult:
    return AudioDownloadResult(
        file_path=audio_path,
        title=meta.title,
        duration=meta.duration,
        cover_url=meta.cover_url,
        platform="douyin",
        video_id=meta.aweme_id,
        raw_info={
            "tags": meta.tags,
            "author": meta.author,
            "source_url": meta.source_url,
            "content_type": meta.content_type,
            "image_urls": meta.image_urls,
        },
        video_path=video_path,
    )


class DouyinDownloader(Downloader):
    def __init__(self, cookie=None):
        super().__init__()

    def extract_video_id(self, url: str) -> str:
        try:
            return extract_aweme_id(normalize_to_share_page(expand_share_url(url)))
        except DouyinResolveError:
            return ""

    def _resolve_meta(self, video_url: str) -> DouyinContentMeta:
        try:
            return resolve_douyin_share(video_url)
        except DouyinResolveError:
            raise
        except Exception as exc:
            raise DouyinResolveError(f"抖音分享页解析失败：{exc}") from exc

    def download(
        self,
        video_url: str,
        output_dir: Union[str, None] = None,
        quality: DownloadQuality = "fast",
        need_video: Optional[bool] = False,
        skip_download: bool = False,
    ) -> AudioDownloadResult:
        if output_dir is None:
            output_dir = get_data_dir()
        if not output_dir:
            output_dir = self.cache_data
        os.makedirs(output_dir, exist_ok=True)

        meta = self._resolve_meta(video_url)
        if meta.content_type == "image":
            return _build_result(meta, "", None)

        video_path = os.path.join(output_dir, f"{meta.aweme_id}.mp4")
        audio_path = os.path.join(output_dir, f"{meta.aweme_id}.mp3")

        if skip_download:
            return _build_result(meta, "", None)

        if not os.path.exists(video_path):
            _download_file(meta.download_url, video_path)

        if not os.path.exists(audio_path):
            try:
                _extract_audio(video_path, audio_path)
            except subprocess.CalledProcessError as exc:
                raise RuntimeError("ffmpeg 转换 MP3 失败") from exc

        return _build_result(
            meta,
            audio_path,
            video_path if need_video or os.path.exists(video_path) else None,
        )

    def download_video(self, video_url: str, output_dir: Union[str, None] = None) -> str:
        if output_dir is None:
            output_dir = get_data_dir()
        if not output_dir:
            output_dir = self.cache_data
        os.makedirs(output_dir, exist_ok=True)

        meta = self._resolve_meta(video_url)
        if meta.content_type == "image":
            raise DouyinResolveError("抖音图文内容没有可下载的视频文件")

        video_path = os.path.join(output_dir, f"{meta.aweme_id}.mp4")
        if not os.path.exists(video_path):
            _download_file(meta.download_url, video_path)
        return video_path

    def download_subtitles(
        self,
        video_url: str,
        output_dir: str = None,
        langs: list = None,
    ) -> Optional[TranscriptResult]:
        meta = self._resolve_meta(video_url)
        if meta.content_type != "image" or not meta.title:
            return None
        return TranscriptResult(
            language="zh",
            full_text=meta.title,
            segments=[
                TranscriptSegment(
                    start=0,
                    end=meta.duration or 0,
                    text=meta.title,
                )
            ],
        )
