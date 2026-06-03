import json
import logging
import os
import time
from dataclasses import asdict
from pathlib import Path
from typing import List, Optional, Tuple, Union, Any

from fastapi import HTTPException
from pydantic import HttpUrl
from dotenv import load_dotenv

from app.downloaders.base import Downloader
from app.downloaders.bilibili_downloader import BilibiliDownloader
from app.downloaders.douyin_downloader import DouyinDownloader
from app.downloaders.local_downloader import LocalDownloader
from app.downloaders.youtube_downloader import YoutubeDownloader
from app.db.video_task_dao import delete_task_by_video, insert_video_task
from app.enmus.exception import NoteErrorEnum, ProviderErrorEnum
from app.enmus.task_status_enums import TaskStatus
from app.enmus.note_enums import DownloadQuality
from app.exceptions.note import NoteError
from app.exceptions.provider import ProviderError
from app.gpt.base import GPT
from app.gpt.gpt_factory import GPTFactory
from app.models.audio_model import AudioDownloadResult
from app.models.gpt_model import GPTSource
from app.models.model_config import ModelConfig
from app.models.notes_model import AudioDownloadResult, NoteResult
from app.models.transcriber_model import TranscriptResult, TranscriptSegment
from app.services.constant import SUPPORT_PLATFORM_MAP
from app.services.provider import ProviderService
from app.transcriber.base import Transcriber
from app.transcriber.transcriber_provider import get_transcriber, _transcribers
from app.utils.cover_helper import localize_cover
from app.utils.note_helper import replace_content_markers, prepend_source_link, normalize_toc
from app.utils.path_helper import get_runtime_dir
from app.utils.screenshot_marker import extract_screenshot_timestamps
from app.utils.status_code import StatusCode
from app.utils.video_helper import generate_screenshot
from app.utils.video_reader import VideoReader

# ------------------ 环境变量与全局配置 ------------------

# 从 .env 文件中加载环境变量
load_dotenv()

# 后端 API 地址与端口（若有需要可以在代码其他部分使用 BACKEND_BASE_URL）
API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost")
BACKEND_PORT = os.getenv("BACKEND_PORT", "8483")
BACKEND_BASE_URL = f"{API_BASE_URL}:{BACKEND_PORT}"

# 输出目录（用于缓存音频、转写、Markdown 文件，以及存储截图）
NOTE_OUTPUT_DIR = Path(os.getenv("NOTE_OUTPUT_DIR", "note_results"))
NOTE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
# 截图目录必须落在 /static 挂载目录之下（见 main.py 的 static_dir）。仅当 OUT_DIR 显式给出
# 绝对路径时才采用它；相对值（如默认 .env 里的 ./static/screenshots）一律改用 get_runtime_dir
# 推导，确保打包后与挂载目录同源，避免 cwd 漂移导致截图 404。
_env_out_dir = os.getenv("OUT_DIR")
IMAGE_OUTPUT_DIR = (
    _env_out_dir
    if _env_out_dir and os.path.isabs(_env_out_dir)
    else os.path.join(get_runtime_dir("static"), "screenshots")
)
os.makedirs(IMAGE_OUTPUT_DIR, exist_ok=True)
# 图片基础 URL（用于生成 Markdown 中的图片链接，需前端静态目录对应）
IMAGE_BASE_URL = os.getenv("IMAGE_BASE_URL", "/static/screenshots")

# 日志配置
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# ─── 下载失败的友好提示（Cookie 相关） ───────────────────────────────
# 平台中文名（用于错误提示）
_PLATFORM_LABELS = {
    "bilibili": "B站",
    "youtube": "YouTube",
    "douyin": "抖音",
    "kuaishou": "快手",
    "xiaohongshu": "小红书",
}

# 这些平台没配 Cookie 时下载/解析大概率失败
_COOKIE_RECOMMENDED_PLATFORMS = {"douyin", "kuaishou", "xiaohongshu", "bilibili"}

# 报错信息中出现这些特征词时，多半与登录态 / Cookie 有关
_COOKIE_ERROR_SIGNALS = (
    "cookie", "Cookie", "COOKIE",
    "登录", "登陆", "login", "Login", "Sign in", "sign in",
    "大会员", "Premium", "members-only", "member only",
    "412", "403", "Forbidden", "风控",
)

# 已翻译过的提示都带这个标记，避免二次翻译
_COOKIE_HINT_MARK = "「设置 → 下载配置」"


def friendly_download_error(exc: Exception, platform: str) -> str:
    """把下载/解析阶段的报错翻译成用户能行动的提示。

    - 平台未设置 Cookie，且（平台强依赖 Cookie 或报错带登录特征）→ 提示去配置 Cookie；
    - 已设置 Cookie 但报错带登录特征 → 提示 Cookie 可能已失效；
    - 其余情况原样返回，并保留原始错误便于排查。
    """
    raw = str(getattr(exc, "message", None) or exc)
    if _COOKIE_HINT_MARK in raw:  # 幂等：已翻译过的不再处理
        return raw

    try:
        from app.services.cookie_manager import CookieConfigManager
        cfm = CookieConfigManager()
        configured = bool(cfm.get(platform) or cfm.get_browser(platform))
    except Exception:
        configured = True  # 读不到配置时宁可不提示，也不要误报「未设置」

    label = _PLATFORM_LABELS.get(platform, platform or "该平台")
    has_signal = any(s in raw for s in _COOKIE_ERROR_SIGNALS)

    if not configured and (platform in _COOKIE_RECOMMENDED_PLATFORMS or has_signal):
        return (
            f"{label}下载/解析失败，可能是未设置 Cookie 导致：请到「设置 → 下载配置」"
            f"为{label}配置 Cookie 后重试。（原始错误：{raw[:300]}）"
        )
    if configured and has_signal:
        return (
            f"{label}的 Cookie 可能已失效或权限不足：请到「设置 → 下载配置」"
            f"更新{label}的 Cookie 后重试。（原始错误：{raw[:300]}）"
        )
    return raw


class NoteGenerator:
    """
    NoteGenerator 用于执行视频/音频下载、转写、GPT 生成笔记、插入截图/链接、
    以及将任务信息写入状态文件与数据库等功能。
    """

    def __init__(self):
        from app.services.transcriber_config_manager import TranscriberConfigManager
        config_manager = TranscriberConfigManager()
        cfg = config_manager.get_config()
        self.model_size: str = cfg["whisper_model_size"]
        self.device: Optional[str] = None
        self.transcriber_type: str = cfg["transcriber_type"]
        self.funasr_model: str = cfg.get("funasr_model") or "paraformer-zh"
        self._transcriber: Optional[Transcriber] = None
        self.video_path: Optional[Path] = None
        self.video_img_urls=[]
        logger.info("NoteGenerator 初始化完成")

    @property
    def transcriber(self) -> Transcriber:
        """懒加载转写器：仅在真正需要转写时才初始化。

        NoteGenerator 还被用于写任务状态、删除笔记、润色等轻量操作；
        之前在 __init__ 里 eager 初始化，配置了不可用引擎（如 mlx-whisper
        未安装）时，连 /generate_note 写 PENDING 状态都会直接 500。
        """
        if self._transcriber is None:
            self._transcriber = self._init_transcriber()
        return self._transcriber


    # ---------------- 公有方法 ----------------

    def generate(
        self,
        video_url: Union[str, HttpUrl],
        platform: str,
        quality: DownloadQuality = DownloadQuality.medium,
        task_id: Optional[str] = None,
        model_name: Optional[str] = None,
        provider_id: Optional[str] = None,
        link: bool = False,
        screenshot: bool = False,
        _format: Optional[List[str]] = None,
        style: Optional[str] = None,
        extras: Optional[str] = None,
        output_path: Optional[str] = None,
        video_understanding: bool = False,
        video_interval: int = 0,
        grid_size: Optional[List[int]] = None,
    ) -> NoteResult | None:
        """
        主流程：按步骤依次下载、转写、GPT 总结、截图/链接处理、存库、返回 NoteResult。

        :param video_url: 视频或音频链接
        :param platform: 平台名称，对应 SUPPORT_PLATFORM_MAP 中的键
        :param quality: 下载音频的质量枚举
        :param task_id: 用于标识本次任务的唯一 ID，亦用于状态文件和缓存文件命名
        :param model_name: GPT 模型名称
        :param provider_id: 模型供应商 ID
        :param link: 是否在笔记中插入视频片段链接
        :param screenshot: 是否在笔记中替换 Screenshot 标记为图片
        :param _format: 包含 'link' 或 'screenshot' 等字符串的列表，决定后续处理
        :param style: GPT 生成笔记的风格
        :param extras: 额外参数，传递给 GPT
        :param output_path: 下载输出目录（可选）
        :param video_understanding: 是否需要视频拼图理解（生成缩略图）
        :param video_interval: 视频帧截取间隔（秒），仅在 video_understanding 为 True 时生效
        :param grid_size: 生成缩略图时的网格大小，如 [3, 3]
        :return: NoteResult 对象，包含 markdown 文本、转写结果和音频元信息
        """
        if grid_size is None:
            grid_size = []

        try:
            logger.info(f"开始生成笔记 (task_id={task_id})")
            self._update_status(task_id, TaskStatus.PARSING)

            # 获取下载器与 GPT 实例

            downloader = self._get_downloader(platform)
            gpt = self._get_gpt(model_name, provider_id)

            # 缓存文件路径
            audio_cache_file = NOTE_OUTPUT_DIR / f"{task_id}_audio.json"
            transcript_cache_file = NOTE_OUTPUT_DIR / f"{task_id}_transcript.json"
            markdown_cache_file = NOTE_OUTPUT_DIR / f"{task_id}_markdown.md"
            # 1. 获取字幕/转写：优先缓存 → 平台字幕 → 音频转写
            transcript = None

            # 尝试读取缓存
            if transcript_cache_file.exists():
                logger.info(f"检测到转写缓存 ({transcript_cache_file})，尝试读取")
                try:
                    data = json.loads(transcript_cache_file.read_text(encoding="utf-8"))
                    segments = [TranscriptSegment(**seg) for seg in data.get("segments", [])]
                    transcript = TranscriptResult(
                        language=data.get("language"),
                        full_text=data["full_text"],
                        segments=segments,
                    )
                    logger.info(f"已从缓存加载转写结果，共 {len(segments)} 段")
                except Exception as e:
                    logger.warning(f"加载转写缓存失败: {e}")

            # 缓存没有，尝试获取平台字幕
            if transcript is None:
                logger.info("尝试获取平台字幕（优先于音频下载）...")
                try:
                    transcript = downloader.download_subtitles(video_url)
                    if transcript and transcript.segments:
                        logger.info(f"成功获取平台字幕，共 {len(transcript.segments)} 段")
                        transcript_cache_file.write_text(
                            json.dumps(asdict(transcript), ensure_ascii=False, indent=2),
                            encoding="utf-8",
                        )
                    else:
                        transcript = None
                        logger.info("平台无可用字幕，将下载音频后转写")
                except Exception as e:
                    logger.warning(f"获取平台字幕失败: {e}，将下载音频后转写")
                    transcript = None

            # 暂停门（步骤1→2）：解析完成后、下载前可暂停
            self._gate(task_id, TaskStatus.PARSING)

            # 2. 下载音频/视频
            # 有字幕时只提取元信息，不下载音视频文件（除非需要截图/视频理解）
            has_transcript = transcript is not None
            need_full_download = not has_transcript or screenshot or video_understanding
            audio_meta = self._download_media(
                downloader=downloader,
                video_url=video_url,
                quality=quality,
                audio_cache_file=audio_cache_file,
                status_phase=TaskStatus.DOWNLOADING,
                platform=platform,
                output_path=output_path,
                screenshot=screenshot,
                video_understanding=video_understanding,
                video_interval=video_interval,
                grid_size=grid_size,
                skip_download=not need_full_download,
            )

            # 封面本地化：B 站封面是 http 直链（桌面端 WebView 按 mixed content 拦截）、
            # 抖音/快手是限时签名 URL（过期 404）。下载到 /static/covers 后存稳定相对路径，
            # 失败则保留原始 URL，由前端直链 + 代理兜底。
            if audio_meta.cover_url and str(audio_meta.cover_url).startswith("http"):
                local_cover = localize_cover(audio_meta.cover_url, platform)
                if local_cover:
                    audio_meta.cover_url = local_cover

            # 暂停门（步骤2→3）：下载完成后、转写前可暂停
            self._gate(task_id, TaskStatus.DOWNLOADING)

            # 3. 如果前面没拿到字幕，走转写流程
            if transcript is None:
                transcript = self._get_transcript(
                    downloader=downloader,
                    video_url=video_url,
                    audio_file=audio_meta.file_path,
                    transcript_cache_file=transcript_cache_file,
                    status_phase=TaskStatus.TRANSCRIBING,
                    task_id=task_id,
                    # 视频级缓存：同一视频重复生成笔记时复用音频转写结果
                    video_cache_file=self._video_transcript_cache_path(platform, audio_meta.video_id),
                )
            else:
                # 字幕路径：已直接拿到转写文本，无需音频转写。仍显式标记「转写文字」步骤，
                # 否则进度会从「下载」直接跳到「总结」，看起来第3、4步一起完成。
                self._update_status(task_id, TaskStatus.TRANSCRIBING)

            # 暂停门（步骤3→4）：转写完成后、总结前可暂停。
            # 注意：进入总结(第4步)后到第5步之间不再设暂停门——前端会禁用暂停按钮。
            self._gate(task_id, TaskStatus.TRANSCRIBING)

            # 3. GPT 总结
            markdown = self._summarize_text(
                audio_meta=audio_meta,
                transcript=transcript,
                gpt=gpt,
                markdown_cache_file=markdown_cache_file,
                link=link,
                screenshot=screenshot,
                formats=_format or [],
                style=style,
                extras=extras,
                video_img_urls=self.video_img_urls,
            )

            # 4. 截图 & 链接替换
            if _format:
                markdown = self._post_process_markdown(
                    markdown=markdown,
                    video_path=self.video_path,
                    formats=_format,
                    audio_meta=audio_meta,
                    platform=platform,
                )

            # 目录区块确定性整形：LLM 偶尔把 ## 标记抄进目录条目 / 生成嵌套子项
            markdown = normalize_toc(markdown)
            markdown = prepend_source_link(markdown, str(video_url))

            # 5. 保存记录到数据库
            self._update_status(task_id, TaskStatus.SAVING)
            self._save_metadata(video_id=audio_meta.video_id, platform=platform, task_id=task_id)

            # 6. 完成
            from app.services import task_control
            task_control.clear(task_id)
            total_tokens = int(getattr(gpt, "total_tokens", 0) or 0)
            self._update_status(task_id, TaskStatus.SUCCESS)
            logger.info(f"笔记生成成功 (task_id={task_id})，消耗 token：{total_tokens}")

            # 7. 异步建立向量索引：跨笔记问答需要 chunks，生成成功就顺手把它索引一份，
            # 用户不用再去 Knowledge 页面手动点「重建索引」。
            # 失败不影响生成主流程，仅记录日志；用线程后台跑，避免阻塞响应返回。
            try:
                import threading
                from app.services.vector_store import VectorStoreManager

                def _auto_index(tid: str):
                    try:
                        VectorStoreManager().index_task(tid)
                        logger.info(f"自动建立索引完成 (task_id={tid})")
                    except Exception as ie:
                        logger.warning(f"自动建立索引失败 (task_id={tid})：{ie}")

                threading.Thread(target=_auto_index, args=(task_id,), daemon=True).start()
            except Exception as ie:
                logger.warning(f"调度自动索引失败 (task_id={task_id})：{ie}")

            return NoteResult(
                markdown=markdown,
                transcript=transcript,
                audio_meta=audio_meta,
                total_tokens=total_tokens,
            )

        except Exception as exc:
            from app.services import task_control
            task_control.clear(task_id)
            logger.error(f"生成笔记流程异常 (task_id={task_id})：{exc}", exc_info=True)
            self._update_status(task_id, TaskStatus.FAILED, message=str(exc))
            return None

    @staticmethod
    def delete_note(video_id: str, platform: str) -> int:
        """
        删除数据库中对应 video_id 与 platform 的任务记录

        :param video_id: 视频 ID
        :param platform: 平台标识
        :return: 删除的记录数
        """
        logger.info(f"删除笔记记录 (video_id={video_id}, platform={platform})")
        return delete_task_by_video(video_id, platform)

    # ---------------- 私有方法 ----------------

    def _init_transcriber(self) -> Transcriber:
        """
        根据环境变量 TRANSCRIBER_TYPE 动态获取并实例化转写器
        """
        if self.transcriber_type not in _transcribers:
            logger.error(f"未找到支持的转写器：{self.transcriber_type}")
            raise Exception(f"不支持的转写器：{self.transcriber_type}")

        logger.info(f"使用转写器：{self.transcriber_type} (model_size={self.model_size})")
        # 必须显式传 model_size：不传的话 get_transcriber 会落到环境变量/默认值，
        # 「音频转写配置」页选的模型大小就不生效了
        return get_transcriber(transcriber_type=self.transcriber_type, model_size=self.model_size)

    def _get_gpt(self, model_name: Optional[str], provider_id: Optional[str]) -> GPT:
        """
        根据 provider_id 获取对应的 GPT 实例
        :param model_name: GPT 模型名称
        :param provider_id: 供应商 ID
        :return: GPT 实例
        """
        provider = ProviderService.get_provider_by_id(provider_id)
        if not provider:
            logger.error(f"[get_gpt] 未找到模型供应商: provider_id={provider_id}")
            raise ProviderError(code=ProviderErrorEnum.NOT_FOUND,message=ProviderErrorEnum.NOT_FOUND.message)
        logger.info(f"创建 GPT 实例 {provider_id}")
        config = ModelConfig(
            api_key=provider["api_key"],
            base_url=provider["base_url"],
            model_name=model_name,
            provider=provider["type"],
            name=provider["name"],
        )
        return GPTFactory().from_config(config)

    def _get_downloader(self, platform: str) -> Downloader:
        """
        根据平台名称获取对应的下载器实例

        :param platform: 平台标识，需在 SUPPORT_PLATFORM_MAP 中
        :return: 对应的 Downloader 子类实例
        """
        downloader_cls = SUPPORT_PLATFORM_MAP.get(platform)
        logger.debug(f"实例化下载器 -  {platform}")
        instance = None
        if not downloader_cls:
            # 兜底：查用户在「下载配置」里登记的自定义平台
            from app.services import custom_platform_manager
            from app.downloaders.generic_downloader import GenericYtdlpDownloader
            custom = custom_platform_manager.get(platform)
            if custom:
                logger.info(f"使用自定义平台下载器: {custom['name']} (key={platform})")
                return GenericYtdlpDownloader(platform=platform)
            logger.error(f"不支持的平台：{platform}")
            raise NoteError(code=NoteErrorEnum.PLATFORM_NOT_SUPPORTED.code,
                            message=NoteErrorEnum.PLATFORM_NOT_SUPPORTED.message)
        try:
            instance = downloader_cls
        except Exception as e:
            logger.error(f"实例化下载器失败：{e}")


        logger.info(f"使用下载器：{downloader_cls.__class__}")
        return instance

    def _gate(self, task_id: Optional[str], current_status: TaskStatus) -> None:
        """步骤之间的暂停门：若任务被暂停，则停在当前步骤等待，直到被恢复。

        暂停期间保留 current_status（不推进到下一步），仅把状态文件标记 paused=true。
        恢复后清除 paused 标记并返回，让调用方继续执行下一步。
        """
        if not task_id:
            return
        from app.services import task_control

        paused_written = False
        while task_control.is_paused(task_id):
            if not paused_written:
                self._update_status(task_id, current_status, paused=True)
                paused_written = True
            time.sleep(1)

        if paused_written:
            self._update_status(task_id, current_status, paused=False)

    def _update_status(self, task_id: Optional[str], status: Union[str, TaskStatus], message: Optional[str] = None, paused: bool = False):
        """
        创建或更新 {task_id}.status.json，记录当前任务状态

        :param task_id: 任务唯一 ID
        :param status: TaskStatus 枚举或自定义状态字符串
        :param message: 可选消息，用于记录失败原因等
        :param paused: 是否处于暂停态（保留当前步骤，仅标记暂停）
        """
        if not task_id:
            return

        NOTE_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        status_file = NOTE_OUTPUT_DIR / f"{task_id}.status.json"
        print(f"写入状态文件: {status_file} 当前状态: {status} paused={paused}")
        data = {"status": status.value if isinstance(status, TaskStatus) else status, "paused": paused}
        if message:
            data["message"] = message

        try:
            # First create a temporary file
            temp_file = status_file.with_suffix('.tmp')

            # Write to temporary file
            with temp_file.open('w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            # Atomic rename operation
            temp_file.replace(status_file)

            print(f"状态文件写入成功: {status_file}")
        except Exception as e:
            logger.error(f"写入状态文件失败 (task_id={task_id})：{e}")
            # Try to write error to file directly as fallback
            try:
                with status_file.open('w', encoding='utf-8') as f:
                    f.write(f"Error writing status: {str(e)}")
            except:
                logger.error(f"写入错误  {e}")

    def _handle_exception(self, task_id, exc):
        logger.error(f"任务异常 (task_id={task_id})", exc_info=True)
        error_message = getattr(exc, 'detail', str(exc))
        if isinstance(error_message, dict):
            try:
                error_message = json.dumps(error_message, ensure_ascii=False)
            except:
                error_message = str(error_message)
        self._update_status(task_id, TaskStatus.FAILED, message=error_message)

    def _download_media(
        self,
        downloader: Downloader,
        video_url: Union[str, HttpUrl],
        quality: DownloadQuality,
        audio_cache_file: Path,
        status_phase: TaskStatus,
        platform: str,
        output_path: Optional[str],
        screenshot: bool,
        video_understanding: bool,
        video_interval: int,
        grid_size: List[int],
        skip_download: bool = False,
    ) -> AudioDownloadResult | None:
        """
        1. 检查音频缓存；若不存在，则根据需要下载音频或视频（若需截图/可视化）。
        2. 如果需要视频，则先下载视频并生成缩略图集，再下载音频。
        3. 返回 AudioDownloadResult

        :param downloader: Downloader 实例
        :param video_url: 视频/音频链接
        :param quality: 音频下载质量
        :param audio_cache_file: 本地缓存 JSON 文件路径
        :param status_phase: 对应的状态枚举，如 TaskStatus.DOWNLOADING
        :param platform: 平台标识
        :param output_path: 下载输出目录（可为 None）
        :param screenshot: 是否需要在笔记中插入截图
        :param video_understanding: 是否需要生成缩略图
        :param video_interval: 视频截帧间隔
        :param grid_size: 缩略图网格尺寸
        :return: AudioDownloadResult 对象
        """
        task_id = audio_cache_file.stem.split("_")[0]
        self._update_status(task_id, status_phase)

        # 已有缓存，尝试加载
        if audio_cache_file.exists():
            logger.info(f"检测到音频缓存 ({audio_cache_file})，直接读取")
            try:
                data = json.loads(audio_cache_file.read_text(encoding="utf-8"))
                return AudioDownloadResult(**data)
            except Exception as e:
                logger.warning(f"读取音频缓存失败，将重新下载：{e}")

        # 有字幕且不需要截图/视频理解时，只提取元信息不下载文件
        if skip_download:
            logger.info("已有字幕，仅提取视频元信息（不下载音视频）")
            try:
                audio = downloader.download(
                    video_url=video_url,
                    quality=quality,
                    output_dir=output_path,
                    need_video=False,
                    skip_download=True,
                )
                audio_cache_file.write_text(
                    json.dumps(asdict(audio), ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                logger.info(f"元信息提取完成 ({audio_cache_file})")
                return audio
            except Exception as exc:
                logger.warning(f"元信息提取失败，将尝试完整下载: {exc}")

        # 判断是否需要下载视频
        need_video = screenshot or video_understanding
        if screenshot and not grid_size:
            grid_size = [2, 2]

        frame_interval = video_interval if video_interval and video_interval > 0 else 6
        if need_video:
            try:
                logger.info("开始下载视频")
                video_path_str = downloader.download_video(video_url)
                self.video_path = Path(video_path_str)
                logger.info(f"视频下载完成：{self.video_path}")

                if grid_size:
                    self.video_img_urls = VideoReader(
                        video_path=str(self.video_path),
                        grid_size=tuple(grid_size),
                        frame_interval=frame_interval,
                        unit_width=960,
                        unit_height=540,
                        save_quality=80,
                    ).run()
                else:
                    logger.info("未指定 grid_size，跳过缩略图生成")
            except Exception as exc:
                logger.error(f"视频下载失败：{exc}")
                friendly = friendly_download_error(exc, platform)
                self._handle_exception(task_id, RuntimeError(friendly))
                raise RuntimeError(friendly) from exc

        # 下载音频
        try:
            logger.info("开始下载音频")
            audio = downloader.download(
                video_url=video_url,
                quality=quality,
                output_dir=output_path,
                need_video=need_video,
            )
            audio_cache_file.write_text(json.dumps(asdict(audio), ensure_ascii=False, indent=2), encoding="utf-8")
            logger.info(f"音频下载并缓存成功 ({audio_cache_file})")
            return audio
        except Exception as exc:
            logger.error(f"音频下载失败：{exc}")
            friendly = friendly_download_error(exc, platform)
            self._handle_exception(task_id, RuntimeError(friendly))
            raise RuntimeError(friendly) from exc


    def _video_transcript_cache_path(self, platform: str, video_id: Optional[str]) -> Optional[Path]:
        """视频级转写缓存路径：以 平台+视频ID+转写引擎+模型 为 key。

        转写缓存原本只按 task_id 存，同一个视频每生成一次笔记就要完整重转一遍
        （本地 whisper 一次要数分钟）。音频转写结果在视频维度复用；
        key 编入引擎与模型大小，切换转写配置后不会命中旧引擎的结果。
        """
        if not video_id:
            return None
        # 模型维度按引擎取：whisper 系是档位/自定义，funasr 是其模型名——
        # 否则换 FunASR 模型不会失效旧缓存（曾出现 en 模型的空结果被 zh 复用）
        model_key = self.funasr_model if self.transcriber_type == "funasr" else self.model_size
        raw_key = f"{platform}_{video_id}_{self.transcriber_type}_{model_key}"
        safe_key = "".join(ch if ch.isalnum() or ch in ("-", "_") else "_" for ch in raw_key)
        cache_dir = NOTE_OUTPUT_DIR / "video_transcripts"
        cache_dir.mkdir(parents=True, exist_ok=True)
        return cache_dir / f"{safe_key}.json"

    def _get_transcript(
        self,
        downloader: Downloader,
        video_url: str,
        audio_file: str,
        transcript_cache_file: Path,
        status_phase: TaskStatus,
        task_id: Optional[str] = None,
        video_cache_file: Optional[Path] = None,
    ) -> TranscriptResult | None:
        """
        优先获取平台字幕，没有则 fallback 到音频转写

        :param downloader: 下载器实例
        :param video_url: 视频链接
        :param audio_file: 音频文件路径（用于 fallback 转写）
        :param transcript_cache_file: 缓存文件路径
        :param status_phase: 状态枚举
        :param task_id: 任务 ID
        :param video_cache_file: 视频级转写缓存路径（跨任务复用音频转写结果）
        :return: TranscriptResult 对象
        """
        self._update_status(task_id, status_phase)

        # 已有缓存，直接返回
        if transcript_cache_file.exists():
            logger.info(f"检测到转写缓存 ({transcript_cache_file})，尝试读取")
            try:
                data = json.loads(transcript_cache_file.read_text(encoding="utf-8"))
                segments = [TranscriptSegment(**seg) for seg in data.get("segments", [])]
                return TranscriptResult(language=data.get("language"), full_text=data["full_text"], segments=segments)
            except Exception as e:
                logger.warning(f"加载转写缓存失败，将重新获取：{e}")

        # 1. 先尝试获取平台字幕
        logger.info("尝试获取平台字幕...")
        try:
            transcript = downloader.download_subtitles(video_url)
            if transcript and transcript.segments:
                logger.info(f"成功获取平台字幕，共 {len(transcript.segments)} 段")
                # 缓存结果
                transcript_cache_file.write_text(
                    json.dumps(asdict(transcript), ensure_ascii=False, indent=2),
                    encoding="utf-8"
                )
                return transcript
            else:
                logger.info("平台无可用字幕，将使用音频转写")
        except Exception as e:
            logger.warning(f"获取平台字幕失败: {e}，将使用音频转写")

        # 2. Fallback 到音频转写
        return self._transcribe_audio(
            audio_file=audio_file,
            transcript_cache_file=transcript_cache_file,
            status_phase=status_phase,
            video_cache_file=video_cache_file,
        )

    def _transcribe_audio(
        self,
        audio_file: str,
        transcript_cache_file: Path,
        status_phase: TaskStatus,
        video_cache_file: Optional[Path] = None,
    ) -> TranscriptResult | None:
        """
        1. 检查转写缓存（先按 task_id，再按视频级缓存）；若存在则尝试加载，
           否则调用转写器生成并缓存。
        2. 返回 TranscriptResult 对象

        :param audio_file: 音频文件本地路径
        :param transcript_cache_file: 转写结果缓存路径（按 task_id）
        :param status_phase: 对应的状态枚举，如 TaskStatus.TRANSCRIBING
        :param video_cache_file: 视频级转写缓存路径（跨任务复用，可空）
        :return: TranscriptResult 对象
        """
        task_id = transcript_cache_file.stem.split("_")[0]
        self._update_status(task_id, status_phase)

        # 已有缓存，尝试加载
        if transcript_cache_file.exists():
            logger.info(f"检测到转写缓存 ({transcript_cache_file})，尝试读取")
            try:
                data = json.loads(transcript_cache_file.read_text(encoding="utf-8"))
                segments = [TranscriptSegment(**seg) for seg in data.get("segments", [])]
                return TranscriptResult(language=data["language"], full_text=data["full_text"], segments=segments)
            except Exception as e:
                logger.warning(f"加载转写缓存失败，将重新转写：{e}")

        # 视频级缓存：同一视频之前的任务已经转写过，直接复用
        if video_cache_file and video_cache_file.exists():
            logger.info(f"检测到视频级转写缓存 ({video_cache_file})，尝试读取")
            try:
                raw_text = video_cache_file.read_text(encoding="utf-8")
                data = json.loads(raw_text)
                segments = [TranscriptSegment(**seg) for seg in data.get("segments", [])]
                transcript = TranscriptResult(
                    language=data.get("language"),
                    full_text=data["full_text"],
                    segments=segments,
                )
                # 回写本任务的缓存文件，repolish 等按 task_id 读取的流程不受影响
                transcript_cache_file.write_text(raw_text, encoding="utf-8")
                return transcript
            except Exception as e:
                logger.warning(f"加载视频级转写缓存失败，将重新转写：{e}")

        # 调用转写器
        try:
            logger.info("开始转写音频")
            transcript = self.transcriber.transcript(file_path=audio_file)
            # 空转写视为失败：空结果一旦入缓存，重试会一直命中空数据并在 GPT 总结阶段
            # 以难懂的 IndexError 崩掉（曾因英文模型转中文视频产出空文本触发）。
            if transcript is None or not (transcript.segments or (transcript.full_text or "").strip()):
                raise RuntimeError(
                    "转写结果为空：可能视频没有人声，或当前转写引擎/模型与视频语言不匹配"
                    "（例如用英文模型转中文视频）。请到「设置 → 音频转写配置」检查后重试。"
                )
            payload = json.dumps(asdict(transcript), ensure_ascii=False, indent=2)
            transcript_cache_file.write_text(payload, encoding="utf-8")
            if video_cache_file:
                try:
                    video_cache_file.write_text(payload, encoding="utf-8")
                except Exception as e:
                    logger.warning(f"写入视频级转写缓存失败（忽略）：{e}")
            logger.info(f"转写并缓存成功 ({transcript_cache_file})")
            return transcript
        except Exception as exc:
            logger.error(f"音频转写失败：{exc}")
            self._handle_exception(task_id, exc)
            raise

    def repolish(
        self,
        task_id: str,
        style: Optional[str],
        extras: Optional[str],
        provider_id: str,
        model_name: str,
    ) -> str:
        """
        基于已生成笔记 + 缓存的 transcript 重新润色一版 markdown：
        - 跳过下载、转写、截图替换等重型环节
        - 只调 LLM 拿一段新 markdown 文本返回（由路由层负责追加到版本列表）
        """
        note_path = NOTE_OUTPUT_DIR / f"{task_id}.json"
        if not note_path.exists():
            raise NoteError(
                code=NoteErrorEnum.PLATFORM_NOT_SUPPORTED.code,
                message=f"笔记不存在：{task_id}",
            )
        data = json.loads(note_path.read_text(encoding="utf-8"))

        audio_meta_d = data.get("audio_meta") or {}
        transcript_d = data.get("transcript") or {}
        segments_raw = transcript_d.get("segments") or []
        if not segments_raw:
            raise NoteError(
                code=NoteErrorEnum.PLATFORM_NOT_SUPPORTED.code,
                message="缺少转写文本，无法重新润色",
            )

        segments = []
        for s in segments_raw:
            try:
                segments.append(TranscriptSegment(**s))
            except TypeError:
                # 兼容只有 start/end/text 字段的旧记录
                segments.append(TranscriptSegment(
                    start=float(s.get("start", 0)),
                    end=float(s.get("end", 0)),
                    text=s.get("text", ""),
                ))

        title = audio_meta_d.get("title") or "笔记"
        raw_info = audio_meta_d.get("raw_info") or {}
        tags = raw_info.get("tags") if isinstance(raw_info.get("tags"), list) else []

        gpt = self._get_gpt(model_name, provider_id)
        source = GPTSource(
            title=title,
            segment=segments,
            tags=tags,
            screenshot=False,
            video_img_urls=[],
            link=False,
            _format=[],
            style=style,
            extras=extras,
            # 用独立 checkpoint_key 避免和原始生成共用 prompt 缓存
            checkpoint_key=f"{task_id}_repolish_{int(time.time())}",
        )
        markdown = gpt.summarize(source)
        logger.info(f"repolish 完成 task_id={task_id} style={style}")
        # 润色版同样做目录区块整形
        return normalize_toc(markdown)

    def _summarize_text(
        self,
        audio_meta: AudioDownloadResult,
        transcript: TranscriptResult,
        gpt: GPT,
        markdown_cache_file: Path,
        link: bool,
        screenshot: bool,
        formats: List[str],
        style: Optional[str],
        extras: Optional[str],
            video_img_urls: List[str],
    ) -> str | None:
        """
        调用 GPT 对转写结果进行总结，生成 Markdown 文本并缓存。

        :param audio_meta: AudioDownloadResult 元信息
        :param transcript: TranscriptResult 转写结果
        :param gpt: GPT 实例
        :param markdown_cache_file: Markdown 缓存路径
        :param link: 是否在笔记中插入链接
        :param screenshot: 是否在笔记中生成截图占位
        :param formats: 包含 'link' 或 'screenshot' 的列表
        :param style: GPT 输出风格
        :param extras: GPT 额外参数
        :return: 生成的 Markdown 字符串
        """
        # markdown_cache_file 名为 "{task_id}_markdown.md"，stem 会带上 "_markdown" 后缀，
        # 直接用它会把状态写到 "{task_id}_markdown.status.json"（错误文件），导致前端
        # 轮询的 "{task_id}.status.json" 永远看不到 SUMMARIZING，进度条从转写直接跳到完成。
        task_id = markdown_cache_file.stem
        if task_id.endswith("_markdown"):
            task_id = task_id[: -len("_markdown")]
        self._update_status(task_id, TaskStatus.SUMMARIZING)

        source = GPTSource(
            title=audio_meta.title,
            segment=transcript.segments,
            tags=audio_meta.raw_info.get("tags", []),
            screenshot=screenshot,
            video_img_urls=video_img_urls,
            link=link,
            _format=formats,
            style=style,
            extras=extras,
            checkpoint_key=task_id,
        )

        try:
            markdown = gpt.summarize(source)
            markdown_cache_file.write_text(markdown, encoding="utf-8")
            logger.info(f"GPT 总结并缓存成功 ({markdown_cache_file})")
            return markdown
        except Exception as exc:
            logger.error(f"GPT 总结失败：{exc}")
            self._handle_exception(task_id, exc)
            raise

    def _post_process_markdown(
        self,
        markdown: str,
        video_path: Optional[Path],
        formats: List[str],
        audio_meta: AudioDownloadResult,
        platform: str,
    ) -> str:
        """
        对生成的 Markdown 做后期处理：插入截图和/或插入链接。

        :param markdown: 原始 Markdown 字符串
        :param video_path: 本地视频路径（可为 None）
        :param formats: 包含 'link' 或 'screenshot' 的列表
        :param audio_meta: AudioDownloadResult 元信息，用于链接替换
        :param platform: 平台标识，用于链接替换
        :return: 处理后的 Markdown 字符串
        """
        if "screenshot" in formats and video_path:
            try:
                markdown = self._insert_screenshots(markdown, video_path)
            except Exception as exc:
                logger.warning("截图插入失败，跳过该步骤")

        if "link" in formats:
            try:
                markdown = replace_content_markers(markdown, video_id=audio_meta.video_id, platform=platform)
            except Exception as e:
                logger.warning(f"链接插入失败，跳过该步骤：{e}")

        return markdown

    def _insert_screenshots(self, markdown: str, video_path: Path) -> str | None | Any:
        """
        扫描 Markdown 文本中所有 Screenshot 标记，并替换为实际生成的截图链接。

        :param markdown: 含有 *Screenshot-mm:ss 或 Screenshot-[mm:ss] 标记的 Markdown 文本
        :param video_path: 本地视频文件路径
        :return: 替换后的 Markdown 字符串
        """
        matches: List[Tuple[str, int]] = extract_screenshot_timestamps(markdown)
        for idx, (marker, ts) in enumerate(matches):
            try:
                img_path = generate_screenshot(str(video_path), str(IMAGE_OUTPUT_DIR), ts, idx)
                filename = Path(img_path).name
                # 构建前端可访问的 URL，例如 /static/screenshots/{filename}
                img_url = f"{IMAGE_BASE_URL.rstrip('/')}/{filename}"
                # 把时间戳写进 alt（「原片 @ mm:ss」），前端据此在截图下方生成
                # 「跳转原片对应时间点」的链接。alt 不显示在页面上，不影响观感。
                alt = f"原片 @ {ts // 60:02d}:{ts % 60:02d}"
                markdown = markdown.replace(marker, f"![{alt}]({img_url})", 1)
            except Exception as exc:
                logger.error(f"生成截图失败 (timestamp={ts})：{exc}")
                # self._handle_exception(task_id, exc)
                return None
        return markdown

    @staticmethod
    def _extract_screenshot_timestamps(markdown: str) -> List[Tuple[str, int]]:
        """
        从 Markdown 文本中提取所有 '*Screenshot-mm:ss' 或 'Screenshot-[mm:ss]' 标记，
        返回 [(原始标记文本, 时间戳秒数), ...] 列表。

        :param markdown: 原始 Markdown 文本
        :return: 标记与对应时间戳秒数的列表
        """
        return extract_screenshot_timestamps(markdown)

    def _save_metadata(self, video_id: str, platform: str, task_id: str) -> None:
        """
        将生成的笔记任务记录插入数据库

        :param video_id: 视频 ID
        :param platform: 平台标识
        :param task_id: 任务 ID
        """
        try:
            insert_video_task(video_id=video_id, platform=platform, task_id=task_id)
            logger.info(f"已保存任务记录到数据库 (video_id={video_id}, platform={platform}, task_id={task_id})")
        except Exception as e:
            logger.error(f"保存任务记录失败：{e}")
