"""通用 yt-dlp 下载器：用于用户在「下载配置」里登记的自定义平台。

不做任何站点特定逻辑——完全依赖 yt-dlp 内置 extractor。只把：
  - 该平台的 Cookie/cookies-from-browser 注入 ydl_opts
  - 全局代理注入 ydl_opts
"""
import logging
import os
import tempfile
from abc import ABC
from typing import Optional, Union

import yt_dlp

from app.downloaders.base import Downloader, DownloadQuality
from app.models.notes_model import AudioDownloadResult
from app.services.cookie_manager import CookieConfigManager
from app.services.proxy_config_manager import ProxyConfigManager
from app.utils.path_helper import get_data_dir

logger = logging.getLogger(__name__)


class GenericYtdlpDownloader(Downloader, ABC):
    """对任意 yt-dlp 支持站点的薄封装。按平台 key 读取 cookie 配置。"""

    def __init__(self, platform: str, cookie_domain: Optional[str] = None):
        super().__init__()
        self.platform = platform
        # cookie 文件里 Netscape 格式需要 domain；不知道就用通用 . 让 yt-dlp 自己挑
        self.cookie_domain = cookie_domain or f".{platform}.com"
        mgr = CookieConfigManager()
        self._cookie = mgr.get(platform)
        self._browser = mgr.get_browser(platform)
        self._cookiefile = None if self._browser else self._write_netscape_cookie_file()

    def _write_netscape_cookie_file(self) -> Optional[str]:
        if not self._cookie:
            return None
        lines = ["# Netscape HTTP Cookie File\n"]
        for pair in self._cookie.split("; "):
            if "=" in pair:
                k, v = pair.split("=", 1)
                lines.append(f"{self.cookie_domain}\tTRUE\t/\tFALSE\t0\t{k}\t{v}\n")
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
        tmp.writelines(lines)
        tmp.close()
        logger.info("已生成 [%s] Netscape Cookie 文件: %s", self.platform, tmp.name)
        return tmp.name

    def _apply_ydl_extras(self, ydl_opts: dict) -> None:
        proxy = ProxyConfigManager().get_proxy_url()
        if proxy:
            ydl_opts['proxy'] = proxy
        if self._browser:
            ydl_opts['cookiesfrombrowser'] = (self._browser,)
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
        self._apply_ydl_extras(ydl_opts)

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=not skip_download)
            video_id = info.get("id") or "unknown"
            title = info.get("title") or self.platform
            duration = info.get("duration", 0)
            cover_url = info.get("thumbnail")
            ext = info.get("ext", "mp3")
            audio_path = os.path.join(output_dir, f"{video_id}.{ext}")

        return AudioDownloadResult(
            file_path=audio_path,
            title=title,
            duration=duration,
            cover_url=cover_url,
            platform=self.platform,
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
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "%(id)s.%(ext)s")
        ydl_opts = {
            'format': 'bestvideo+bestaudio/best',
            'outtmpl': output_path,
            'noplaylist': True,
            'quiet': False,
            'merge_output_format': 'mp4',
        }
        self._apply_ydl_extras(ydl_opts)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            video_id = info.get("id")
            video_path = os.path.join(output_dir, f"{video_id}.mp4")
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"视频文件未找到: {video_path}")
        return video_path
