import os
import logging
import tempfile
from abc import ABC
from typing import Union, Optional, List

import yt_dlp

from app.downloaders.base import Downloader, DownloadQuality
from app.downloaders.youtube_subtitle import YouTubeSubtitleFetcher
from app.models.notes_model import AudioDownloadResult
from app.models.transcriber_model import TranscriptResult
from app.services.cookie_manager import CookieConfigManager
from app.services.proxy_config_manager import ProxyConfigManager
from app.utils.path_helper import get_data_dir
from app.utils.url_parser import extract_video_id

logger = logging.getLogger(__name__)


def _apply_proxy(ydl_opts: dict) -> dict:
    """YouTube 在国内需要代理。配置了全局代理就塞进 yt-dlp opts。"""
    proxy = ProxyConfigManager().get_proxy_url()
    if proxy:
        ydl_opts['proxy'] = proxy
        logger.info(f"yt-dlp 走代理: {proxy}")
    return ydl_opts


def _apply_youtube_extractor_args(ydl_opts: dict) -> dict:
    """绕开 YouTube SSAP（server-side ads）实验：web 客户端常常拿不到 URL（issue #12482）。

    只用不需要 PO Token 的客户端：
      - tv：YouTube TV 网页客户端，目前最稳，多数视频可以直接拿到 m4a 音频流
      - web_safari：Safari User-Agent 走的 web 客户端，部分场景比纯 web 健壮
    避免 ios / mweb / android：它们都被 yt-dlp 标注 require PO Token，没提供时会跳过全部格式。
    """
    ydl_opts.setdefault('extractor_args', {})
    ydl_opts['extractor_args'].setdefault('youtube', {})
    ydl_opts['extractor_args']['youtube']['player_client'] = ['tv', 'web_safari']
    return ydl_opts


class YoutubeDownloader(Downloader, ABC):
    def __init__(self):

        super().__init__()
        self._cookie_mgr = CookieConfigManager()
        self._cookie = self._cookie_mgr.get('youtube')
        # 优先级：浏览器实时 cookies > 粘贴的 cookie 字符串。
        # 配了浏览器就走 yt-dlp `cookiesfrombrowser`，能避开 YouTube 的会话轮换风控。
        self._browser = self._cookie_mgr.get_browser('youtube')
        self._cookiefile = None if self._browser else self._write_netscape_cookie_file()

    def _write_netscape_cookie_file(self) -> Optional[str]:
        """将 YouTube Cookie 写入 Netscape 格式临时文件，供 yt-dlp cookiefile 使用。

        没有 Cookie 时返回 None；YouTube 现在没 Cookie 基本会被拦在「Sign in to confirm you're not a bot」。
        """
        if not self._cookie:
            logger.warning("YouTube Cookie 未配置，下载可能会被风控为机器人")
            return None
        lines = ["# Netscape HTTP Cookie File\n"]
        for pair in self._cookie.split("; "):
            if "=" in pair:
                key, value = pair.split("=", 1)
                lines.append(f".youtube.com\tTRUE\t/\tFALSE\t0\t{key}\t{value}\n")
        tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False, encoding='utf-8')
        tmp.writelines(lines)
        tmp.close()
        logger.info("已生成 YouTube Netscape Cookie 文件: %s (条目: %d)", tmp.name, len(lines) - 1)
        return tmp.name

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
            'format': 'bestaudio[ext=m4a]/bestaudio/best',
            'outtmpl': output_path,
            'noplaylist': True,
            'quiet': False,
        }

        if skip_download:
            ydl_opts['skip_download'] = True

        _apply_proxy(ydl_opts)
        _apply_youtube_extractor_args(ydl_opts)
        if self._browser:
            # (browser_name,) 形式即可；profile/keyring/container 留默认
            ydl_opts['cookiesfrombrowser'] = (self._browser,)
            logger.info(f"YouTube 使用 cookies-from-browser: {self._browser}")
        elif self._cookiefile:
            ydl_opts['cookiefile'] = self._cookiefile

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(video_url, download=not skip_download)
                video_id = info.get("id")
                title = info.get("title")
                duration = info.get("duration", 0)
                cover_url = info.get("thumbnail")
                ext = info.get("ext", "m4a")
                audio_path = os.path.join(output_dir, f"{video_id}.{ext}")

            return AudioDownloadResult(
                file_path=audio_path,
                title=title,
                duration=duration,
                cover_url=cover_url,
                platform="youtube",
                video_id=video_id,
                raw_info={'tags': info.get('tags')},
                video_path=None,
            )
        except Exception as exc:
            # DRM / 反爬 / 格式不可用等情况下 yt-dlp 拉不动；只要本次仅需要 metadata
            # （即字幕路径，skip_download=True），就退到 YouTube oEmbed 兜底拿标题+封面，
            # 让流程能继续走总结。需要下载音视频时只能向上抛。
            if not skip_download:
                raise
            logger.warning(f"yt-dlp 获取元数据失败，回退 oEmbed: {exc}")
            return self._fallback_metadata(video_url)

    def _fallback_metadata(self, video_url: str) -> AudioDownloadResult:
        """yt-dlp 失败时的兜底：用 YouTube 公开的 oEmbed 接口拿基础 metadata。

        只能拿到 title / thumbnail / author 这几样；duration / tags 拿不到，做空值处理。
        DRM、bot 拦截等都不影响 oEmbed。
        """
        import requests

        video_id = extract_video_id(video_url, "youtube") or ""
        title = video_id or "YouTube 视频"
        cover = f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg" if video_id else ""
        try:
            proxies = None
            proxy = ProxyConfigManager().get_proxy_url()
            if proxy:
                proxies = {"http": proxy, "https": proxy}
            resp = requests.get(
                "https://www.youtube.com/oembed",
                params={"url": video_url, "format": "json"},
                proxies=proxies,
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("title"):
                title = data["title"]
            if data.get("thumbnail_url"):
                cover = data["thumbnail_url"]
            logger.info(f"oEmbed 兜底成功：title={title}")
        except Exception as e:
            logger.warning(f"oEmbed 兜底也失败，使用最小元数据：{e}")

        return AudioDownloadResult(
            file_path="",          # 没下载音视频文件
            title=title,
            duration=0,            # oEmbed 不返回时长
            cover_url=cover,
            platform="youtube",
            video_id=video_id,
            raw_info={"tags": []}, # oEmbed 不返回标签
            video_path=None,
        )

    def download_video(
        self,
        video_url: str,
        output_dir: Union[str, None] = None,
    ) -> str:
        """
        下载视频，返回视频文件路径
        """
        if output_dir is None:
            output_dir = get_data_dir()
        video_id = extract_video_id(video_url, "youtube")
        video_path = os.path.join(output_dir, f"{video_id}.mp4")
        if os.path.exists(video_path):
            return video_path
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, "%(id)s.%(ext)s")

        ydl_opts = {
            'format': 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
            'outtmpl': output_path,
            'noplaylist': True,
            'quiet': False,
            'merge_output_format': 'mp4',  # 确保合并成 mp4
        }

        _apply_proxy(ydl_opts)
        _apply_youtube_extractor_args(ydl_opts)
        if self._browser:
            # (browser_name,) 形式即可；profile/keyring/container 留默认
            ydl_opts['cookiesfrombrowser'] = (self._browser,)
            logger.info(f"YouTube 使用 cookies-from-browser: {self._browser}")
        elif self._cookiefile:
            ydl_opts['cookiefile'] = self._cookiefile
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            video_id = info.get("id")
            video_path = os.path.join(output_dir, f"{video_id}.mp4")

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"视频文件未找到: {video_path}")

        return video_path

    def download_subtitles(self, video_url: str, output_dir: str = None,
                           langs: List[str] = None) -> Optional[TranscriptResult]:
        """
        通过 YouTube InnerTube API 直接获取字幕（优先人工字幕，其次自动生成）。
        比 yt_dlp 方式更轻量，无需写临时文件到磁盘。

        :param video_url: 视频链接
        :param output_dir: 未使用（保留接口兼容）
        :param langs: 优先语言列表
        :return: TranscriptResult 或 None
        """
        if langs is None:
            langs = ['zh-Hans', 'zh', 'zh-CN', 'zh-TW', 'en', 'en-US', 'ja']

        video_id = extract_video_id(video_url, "youtube")
        fetcher = YouTubeSubtitleFetcher()
        print(
            f"尝试获取字幕，video_id={video_id}, langs={langs}"
        )
        return fetcher.fetch_subtitles(video_id, langs)
