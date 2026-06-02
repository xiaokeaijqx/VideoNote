"""小红书下载器：基于 yt-dlp 内置 XiaoHongShu extractor。

URL 模式：
  - https://www.xiaohongshu.com/explore/{id}
  - https://www.xiaohongshu.com/discovery/item/{id}
  - 短链 xhslink.com/xxx 由 yt-dlp 自行跟随重定向

小红书很多内容是图文笔记（无视频/音频）。无视频的会触发 yt-dlp 报「请求格式不可用」，
前端会展示生成失败——这是预期行为，不强行兜底。
"""
import os
import logging
import tempfile
from abc import ABC
from typing import Union, Optional

import yt_dlp

from app.downloaders.base import Downloader, DownloadQuality
from app.models.notes_model import AudioDownloadResult
from app.services.cookie_manager import CookieConfigManager
from app.utils.path_helper import get_data_dir
from app.utils.url_parser import extract_video_id

logger = logging.getLogger(__name__)


class XiaohongshuDownloader(Downloader, ABC):
    def __init__(self):
        super().__init__()
        self._cookie_mgr = CookieConfigManager()
        self._cookie = self._cookie_mgr.get('xiaohongshu')
        self._browser = self._cookie_mgr.get_browser('xiaohongshu')
        self._cookiefile = None if self._browser else self._write_netscape_cookie_file()

    def _write_netscape_cookie_file(self) -> Optional[str]:
        if not self._cookie:
            logger.warning("小红书 Cookie 未配置，部分内容可能下载失败")
            return None
        lines = ["# Netscape HTTP Cookie File\n"]
        for pair in self._cookie.split("; "):
            if "=" in pair:
                key, value = pair.split("=", 1)
                lines.append(f".xiaohongshu.com\tTRUE\t/\tFALSE\t0\t{key}\t{value}\n")
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
        tmp.writelines(lines)
        tmp.close()
        logger.info("已生成小红书 Netscape Cookie 文件: %s (条目: %d)", tmp.name, len(lines) - 1)
        return tmp.name

    def _apply_cookie(self, ydl_opts: dict) -> None:
        if self._browser:
            ydl_opts['cookiesfrombrowser'] = (self._browser,)
            logger.info(f"小红书使用 cookies-from-browser: {self._browser}")
        elif self._cookiefile:
            ydl_opts['cookiefile'] = self._cookiefile

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

        output_path = os.path.join(output_dir, "%(id)s.%(ext)s")
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': output_path,
            'noplaylist': True,
            'quiet': False,
        }
        if skip_download:
            ydl_opts['skip_download'] = True
        self._apply_cookie(ydl_opts)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=not skip_download)
            video_id = info.get("id")
            title = info.get("title")
            duration = info.get("duration", 0)
            cover_url = info.get("thumbnail")
            ext = info.get("ext", "mp3")
            audio_path = os.path.join(output_dir, f"{video_id}.{ext}")

        return AudioDownloadResult(
            file_path=audio_path,
            title=title,
            duration=duration,
            cover_url=cover_url,
            platform="xiaohongshu",
            video_id=video_id,
            raw_info={'tags': info.get('tags')},
            video_path=None,
        )

    def download_video(
        self,
        video_url: str,
        output_dir: Union[str, None] = None,
    ) -> str:
        if output_dir is None:
            output_dir = get_data_dir()
        video_id = extract_video_id(video_url, "xiaohongshu")
        video_path = os.path.join(output_dir, f"{video_id}.mp4")
        if os.path.exists(video_path):
            return video_path
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "%(id)s.%(ext)s")
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': output_path,
            'noplaylist': True,
            'quiet': False,
            'merge_output_format': 'mp4',
        }
        self._apply_cookie(ydl_opts)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            video_id = info.get("id")
            video_path = os.path.join(output_dir, f"{video_id}.mp4")
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"视频文件未找到: {video_path}")
        return video_path
