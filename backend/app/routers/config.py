import os
import platform
from pathlib import Path

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
from app.utils.response import ResponseWrapper as R
from app.utils.logger import get_logger
from app.utils.path_helper import get_model_dir

from app.services.cookie_manager import CookieConfigManager
from app.services.transcriber_config_manager import TranscriberConfigManager
from ffmpeg_helper import ensure_ffmpeg_or_raise

logger = get_logger(__name__)

router = APIRouter()
cookie_manager = CookieConfigManager()
transcriber_config_manager = TranscriberConfigManager()


class CookieUpdateRequest(BaseModel):
    platform: str
    cookie: str
    # 可选：「从浏览器读取 cookie」配置；为空字符串表示清除该设置。
    # 支持的值参见 yt-dlp 文档（chrome/firefox/safari/edge/brave/chromium/opera/vivaldi/whale）。
    browser: Optional[str] = None


class BrowserCookieSyncRequest(BaseModel):
    platform: str
    browser: str


@router.get("/get_downloader_cookie/{platform}")
def get_cookie(platform: str):
    cookie = cookie_manager.get(platform) or ""
    browser = cookie_manager.get_browser(platform) or ""
    if not cookie and not browser:
        return R.success(msg='未找到Cookies', data={"platform": platform, "cookie": "", "browser": ""})
    return R.success(
        data={"platform": platform, "cookie": cookie, "browser": browser}
    )


class CustomPlatformRequest(BaseModel):
    key: str
    name: str
    match: str


@router.get("/custom_platforms")
def list_custom_platforms():
    from app.services import custom_platform_manager
    return R.success(data=custom_platform_manager.list_all())


@router.post("/custom_platforms")
def upsert_custom_platform(data: CustomPlatformRequest):
    from app.services import custom_platform_manager
    try:
        item = custom_platform_manager.upsert(data.key, data.name, data.match)
        return R.success(data=item)
    except ValueError as e:
        return R.error(msg=str(e))


@router.delete("/custom_platforms/{key}")
def delete_custom_platform(key: str):
    from app.services import custom_platform_manager
    from app.services.cookie_manager import CookieConfigManager
    if custom_platform_manager.delete(key):
        # 顺便清掉关联的 cookie 记录，保持配置文件整洁
        CookieConfigManager().delete(key)
        return R.success(msg="已删除")
    return R.error(msg="未找到该自定义平台")


@router.post("/update_downloader_cookie")
def update_cookie(data: CookieUpdateRequest):
    cookie = (data.cookie or "").strip()
    browser = (data.browser or "").strip() if data.browser is not None else None
    # 两者都空 → 视为清除整条配置，保持 config 文件整洁
    if not cookie and (browser == "" or browser is None):
        cookie_manager.delete(data.platform)
    else:
        cookie_manager.set(data.platform, cookie, browser=browser if browser is not None else None)
    return R.success()


@router.post("/sync_downloader_cookie_from_browser")
def sync_cookie_from_browser(data: BrowserCookieSyncRequest):
    from app.services.browser_cookie import BrowserCookieError, sync_browser_cookie

    try:
        result = sync_browser_cookie(data.platform, data.browser, manager=cookie_manager)
        return R.success(data=result, msg=f"已从浏览器读取 {result['count']} 条 Cookie")
    except BrowserCookieError as exc:
        return R.error(msg=str(exc))


class TranscriberConfigRequest(BaseModel):
    transcriber_type: str
    whisper_model_size: Optional[str] = None
    whisper_custom_model: Optional[str] = None
    funasr_model: Optional[str] = None


AVAILABLE_TRANSCRIBER_TYPES = [
    {"value": "fast-whisper", "label": "Faster Whisper（本地）"},
    {"value": "bcut", "label": "必剪（在线）"},
    {"value": "kuaishou", "label": "快手（在线）"},
    {"value": "groq", "label": "Groq（在线）"},
    {"value": "mlx-whisper", "label": "MLX Whisper（仅macOS）"},
    {"value": "funasr", "label": "FunASR（阿里·中文，需装依赖）"},
]

# "custom" 末项：用户自定义本地/HF whisper 模型（路径见 whisper_custom_model）
WHISPER_MODEL_SIZES = ["tiny", "base", "small", "medium", "large-v3", "large-v3-turbo", "custom"]


@router.get("/transcriber_config")
def get_transcriber_config():
    import sys
    from app.transcriber.transcriber_provider import MLX_WHISPER_AVAILABLE, FUNASR_AVAILABLE

    config = transcriber_config_manager.get_config()

    # mlx_whisper 不可用时给前端精确的安装指引：
    # - 桌面端（冻结）：装到插件目录（main.py 启动时已加进 sys.path），必须用 Python 3.11
    # - 源码/Docker：直接装进后端环境
    if getattr(sys, "frozen", False):
        from app.utils.path_helper import get_plugin_packages_dir
        plugin_dir = get_plugin_packages_dir()
        mlx_install_command = f'python3.11 -m pip install --target "{plugin_dir}" mlx_whisper'
        mlx_install_note = (
            "桌面版应用内置 Python 3.11，必须用同版本 Python 安装（macOS 可先 "
            "brew install python@3.11）。安装完成后重启应用生效。"
        )
    else:
        plugin_dir = ""
        mlx_install_command = "pip install mlx_whisper"
        mlx_install_note = "安装到后端运行环境（venv）后重启后端生效。"

    return R.success(data={
        **config,
        "available_types": AVAILABLE_TRANSCRIBER_TYPES,
        "whisper_model_sizes": WHISPER_MODEL_SIZES,
        "mlx_whisper_available": MLX_WHISPER_AVAILABLE,
        "mlx_install_command": mlx_install_command,
        "mlx_install_note": mlx_install_note,
        "mlx_plugin_dir": plugin_dir,
        # FunASR 可选引擎：未安装时前端给安装指引并禁用保存。
        # 桌面冻结包不支持（torch 与 PyInstaller 运行时不兼容，装进插件目录会让应用无法启动），
        # 此时不下发安装命令，只给说明。
        "funasr_available": FUNASR_AVAILABLE,
        "funasr_install_command": "" if getattr(sys, "frozen", False) else "pip install funasr torch torchaudio",
        "funasr_install_note": (
            "桌面版暂不支持 FunASR：其依赖的 PyTorch 与桌面打包运行时不兼容，"
            "强行安装到插件目录会导致应用无法启动。如需 FunASR 请使用源码或 Docker 部署。"
            if getattr(sys, "frozen", False)
            else "FunASR 依赖 PyTorch（约 2GB），属可选引擎，安装到后端运行环境（venv）后重启生效；"
                 "中文识别效果通常优于 Whisper，模型首次使用经 modelscope 自动下载。"
        ),
    })


@router.post("/transcriber_config")
def update_transcriber_config(data: TranscriberConfigRequest):
    config = transcriber_config_manager.update_config(
        transcriber_type=data.transcriber_type,
        whisper_model_size=data.whisper_model_size,
        whisper_custom_model=data.whisper_custom_model,
        funasr_model=data.funasr_model,
    )
    return R.success(data=config)


# ---- 全局代理配置（作用于 LLM API + 转写 API + yt-dlp 下载）----

class ProxyConfigRequest(BaseModel):
    enabled: bool
    url: Optional[str] = None


@router.get("/proxy_config")
def get_proxy_config():
    from app.services.proxy_config_manager import ProxyConfigManager
    mgr = ProxyConfigManager()
    cfg = mgr.get_config()
    # effective 给前端展示「当前实际生效的代理」——可能来自配置，也可能来自 env 兜底
    return R.success(data={
        **cfg,
        "effective": mgr.get_proxy_url() or "",
    })


@router.post("/proxy_config")
def update_proxy_config(data: ProxyConfigRequest):
    from app.services.proxy_config_manager import ProxyConfigManager
    mgr = ProxyConfigManager()
    cfg = mgr.update_config(enabled=data.enabled, url=data.url)
    return R.success(data={
        **cfg,
        "effective": mgr.get_proxy_url() or "",
    })


# ---- Whisper 模型下载状态 & 下载触发 ----

# 用于跟踪正在进行的下载任务
_downloading: dict[str, str] = {}  # model_size -> status ("downloading" | "done" | "failed")


def _check_whisper_model_exists(model_size: str, subdir: str = "whisper") -> bool:
    """检查指定 whisper 模型是否已下载完整到本地。

    faster-whisper 把模型缓存在 HF cache 布局下：
      <model_dir>/models--Systran--faster-whisper-{size}/snapshots/<hash>/model.bin
    必须能在某个 snapshot 目录里找到 model.bin 才算完成。
    （历史 modelscope 布局 <model_dir>/whisper-{size}/model.bin 也兼容识别。）
    """
    model_dir = Path(get_model_dir(subdir))
    # HF cache 布局
    hf_repo_dir = model_dir / f"models--Systran--faster-whisper-{model_size}" / "snapshots"
    if hf_repo_dir.exists():
        for snapshot in hf_repo_dir.iterdir():
            if (snapshot / "model.bin").exists():
                return True
    # 历史 modelscope 布局（向后兼容老用户）
    legacy = model_dir / f"whisper-{model_size}" / "model.bin"
    return legacy.exists()


def _check_mlx_whisper_model_exists(model_size: str) -> bool:
    """检查 mlx-whisper 模型是否已下载完整到本地。

    与 fast-whisper 的目录布局不同：mlx 模型按 HuggingFace repo_id
    （如 mlx-community/whisper-tiny-mlx）落盘，且没有 model.bin，
    用 config.json 作为「下载完成」的判据，和 mlx_whisper_transcriber.py 保持一致。
    """
    try:
        from app.transcriber.mlx_whisper_transcriber import MLX_MODEL_MAP
    except Exception:
        return False
    repo_id = MLX_MODEL_MAP.get(model_size)
    if not repo_id:
        return False
    model_dir = get_model_dir("mlx-whisper")
    model_path = os.path.join(model_dir, repo_id)
    return (Path(model_path) / "config.json").exists()


# ---- FunASR 模型预下载 ----
# 常用 FunASR 模型 → 实际需要的 modelscope 仓库（主模型 + 流水线依赖的 vad/punc）。
# 预下载用 modelscope.snapshot_download 落到 funasr AutoModel 同一份缓存，
# 这样首个任务不再边跑边下（曾因下载中断产生损坏的 punc 模型）。
_FUNASR_VAD_REPO = "iic/speech_fsmn_vad_zh-cn-16k-common-pytorch"
_FUNASR_PUNC_REPO = "iic/punc_ct-transformer_cn-en-common-vocab471067-large"
FUNASR_MODEL_REPOS: dict = {
    "paraformer-zh": [
        "iic/speech_seaco_paraformer_large_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
        _FUNASR_VAD_REPO,
        _FUNASR_PUNC_REPO,
    ],
    "SenseVoiceSmall": ["iic/SenseVoiceSmall", _FUNASR_VAD_REPO],
    "paraformer-zh-streaming": [
        "iic/speech_paraformer-large_asr_nat-zh-cn-16k-common-vocab8404-online",
        _FUNASR_VAD_REPO,
        _FUNASR_PUNC_REPO,
    ],
}


def _modelscope_cache_root() -> Path:
    """modelscope 默认缓存根（funasr AutoModel 下载落点相同）。"""
    return Path(os.path.expanduser(os.getenv("MODELSCOPE_CACHE", "~/.cache/modelscope"))) / "hub" / "models"


def _check_funasr_model_exists(name: str) -> bool:
    """FunASR 模型（含其 vad/punc 依赖）是否已全部落盘。以 model.pt 存在为判据。"""
    repos = FUNASR_MODEL_REPOS.get(name)
    if not repos:
        return False  # 未知/自定义模型不做预下载判定，首跑时按需下载
    return all((_modelscope_cache_root() / r / "model.pt").exists() for r in repos)


def _do_download_funasr(name: str):
    """后台预下载 FunASR 模型及其依赖（modelscope 自带校验，可断点续传/修复）。"""
    key = f"funasr-{name}"
    try:
        _downloading[key] = "downloading"
        from modelscope.hub.snapshot_download import snapshot_download as ms_download

        for repo in FUNASR_MODEL_REPOS.get(name, []):
            if (_modelscope_cache_root() / repo / "model.pt").exists():
                continue
            logger.info(f"下载 FunASR 模型: {repo}")
            ms_download(repo)
        logger.info(f"FunASR 模型下载完成: {name}")
        _downloading[key] = "done"
    except Exception as e:
        logger.error(f"FunASR 模型下载失败: {name}, {e}")
        _downloading[key] = "failed"


@router.get("/transcriber_models_status")
def get_transcriber_models_status():
    """返回所有 whisper 模型的下载状态。"""
    statuses = []
    for size in WHISPER_MODEL_SIZES:
        downloaded = _check_whisper_model_exists(size, "whisper")
        download_status = _downloading.get(size)
        statuses.append({
            "model_size": size,
            "downloaded": downloaded,
            "downloading": download_status == "downloading",
        })

    # 也检查 mlx-whisper（仅 macOS）
    # 注意：import mlx_whisper 会 dlopen MLX 原生库，若打包缺少 libjaccl.dylib 等会抛 ImportError。
    # 必须 try/except 兜住——否则 mlx 不可用时会把上面已算好的 fast-whisper 状态一起 500 掉，
    # 导致前端「模型管理」整张卡（含 fast-whisper 下载按钮）都不渲染。
    mlx_available = platform.system() == "Darwin"
    mlx_statuses = []
    if mlx_available:
        try:
            from app.transcriber.mlx_whisper_transcriber import MLX_MODEL_MAP
            for size in WHISPER_MODEL_SIZES:
                mlx_key = f"mlx-{size}"
                repo_id = MLX_MODEL_MAP.get(size)
                # 用 config.json 判定，和 _check_mlx_whisper_model_exists / 加载逻辑保持一致
                downloaded = _check_mlx_whisper_model_exists(size)
                mlx_statuses.append({
                    "model_size": size,
                    "downloaded": downloaded,
                    "downloading": _downloading.get(mlx_key) == "downloading",
                    "available": repo_id is not None,
                })
        except Exception as e:
            logger.warning(f"mlx-whisper 不可用（原生库加载失败等），降级跳过其模型状态: {e}")
            mlx_available = False
            mlx_statuses = []

    # FunASR 模型（预下载状态；不依赖 funasr 包，下载走 modelscope）
    funasr_statuses = [
        {
            "model_size": name,
            "downloaded": _check_funasr_model_exists(name),
            "downloading": _downloading.get(f"funasr-{name}") == "downloading",
        }
        for name in FUNASR_MODEL_REPOS
    ]

    return R.success(data={
        "whisper": statuses,
        "mlx_whisper": mlx_statuses,
        "mlx_available": mlx_available,
        "funasr": funasr_statuses,
    })


class ModelDownloadRequest(BaseModel):
    model_size: str
    transcriber_type: str = "fast-whisper"  # "fast-whisper" 或 "mlx-whisper"


def _do_download_whisper(model_size: str):
    """后台下载 faster-whisper 模型。

    直接走 huggingface_hub.snapshot_download，把模型放到 HF cache 布局里——
    这样 faster-whisper 加载时（WhisperModel(model_size_or_path=size_name,
    download_root=model_dir)）能直接命中缓存，跟加载路径完全对齐。
    """
    from huggingface_hub import snapshot_download

    try:
        _downloading[model_size] = "downloading"
        model_dir = get_model_dir("whisper")

        # 已经下好就不重复下
        if _check_whisper_model_exists(model_size, "whisper"):
            _downloading[model_size] = "done"
            return
        repo_id = f"Systran/faster-whisper-{model_size}"
        logger.info(f"开始下载 whisper 模型: {repo_id}")
        # 跟 faster-whisper utils.py 用同样的 allow_patterns，避免多下无关文件；
        # 不传 local_dir 让它走 HF 默认 cache 布局（与加载逻辑对齐）
        snapshot_download(
            repo_id,
            cache_dir=model_dir,
            allow_patterns=[
                "config.json",
                "preprocessor_config.json",
                "model.bin",
                "tokenizer.json",
                "vocabulary.*",
            ],
        )
        logger.info(f"whisper 模型下载完成: {model_size}")
        _downloading[model_size] = "done"
    except Exception as e:
        logger.error(f"whisper 模型下载失败: {model_size}, {e}")
        _downloading[model_size] = "failed"


def _do_download_mlx_whisper(model_size: str):
    """后台下载 mlx-whisper 模型。"""
    key = f"mlx-{model_size}"
    try:
        _downloading[key] = "downloading"
        from huggingface_hub import snapshot_download as hf_download
        from app.transcriber.mlx_whisper_transcriber import resolve_mlx_repo_id

        try:
            repo_id = resolve_mlx_repo_id(model_size)
        except ValueError as e:
            logger.error(str(e))
            _downloading[key] = "failed"
            return

        model_dir = get_model_dir("mlx-whisper")
        model_path = os.path.join(model_dir, repo_id)
        # 用 config.json 判定而非目录存在：半成品目录不能算「已下载」
        if (Path(model_path) / "config.json").exists():
            _downloading[key] = "done"
            return
        logger.info(f"开始下载 mlx-whisper 模型: {model_size} ← {repo_id}")
        hf_download(repo_id, local_dir=model_path, local_dir_use_symlinks=False)
        logger.info(f"mlx-whisper 模型下载完成: {model_size}")
        _downloading[key] = "done"
    except Exception as e:
        logger.error(f"mlx-whisper 模型下载失败: {model_size}, {e}")
        _downloading[key] = "failed"


class ModelDeleteRequest(BaseModel):
    model_size: str
    transcriber_type: str = "fast-whisper"  # "fast-whisper" / "mlx-whisper" / "funasr"


@router.post("/transcriber_delete")
def delete_transcriber_model(data: ModelDeleteRequest):
    """卸载（删除）已下载到本地的转写模型，释放磁盘空间；可随时重新下载。"""
    import shutil

    size = data.model_size
    ttype = data.transcriber_type

    # 下载中的模型不允许删，避免半删半下产生损坏缓存
    dl_key = {"mlx-whisper": f"mlx-{size}", "funasr": f"funasr-{size}"}.get(ttype, size)
    if _downloading.get(dl_key) == "downloading":
        return R.error(msg="该模型正在下载中，请等待下载完成后再卸载")

    targets: list = []
    if ttype == "fast-whisper":
        if size not in WHISPER_MODEL_SIZES:
            return R.error(msg=f"未知模型: {size}")
        model_dir = Path(get_model_dir("whisper"))
        targets = [
            model_dir / f"models--Systran--faster-whisper-{size}",
            model_dir / f"whisper-{size}",  # 历史 modelscope 布局
        ]
    elif ttype == "mlx-whisper":
        try:
            from app.transcriber.mlx_whisper_transcriber import resolve_mlx_repo_id
            repo = resolve_mlx_repo_id(size)
        except Exception as e:
            return R.error(msg=f"未知模型: {size} ({e})")
        targets = [Path(get_model_dir("mlx-whisper")) / repo]
    elif ttype == "funasr":
        repos = FUNASR_MODEL_REPOS.get(size)
        if not repos:
            return R.error(msg=f"未知模型: {size}")
        # 共享依赖保护：vad/punc 被多个 FunASR 模型共用，
        # 只删「其他已下载模型」不再需要的仓库
        keep = set()
        for other, other_repos in FUNASR_MODEL_REPOS.items():
            if other != size and _check_funasr_model_exists(other):
                keep.update(other_repos)
        targets = [_modelscope_cache_root() / r for r in repos if r not in keep]
    else:
        return R.error(msg=f"未知转写器类型: {ttype}")

    removed = 0
    for t in targets:
        if t.exists():
            shutil.rmtree(t, ignore_errors=True)
            removed += 1
            logger.info(f"已卸载模型目录: {t}")
    _downloading.pop(dl_key, None)  # 清掉历史下载状态，避免显示残留

    if removed == 0:
        return R.success(msg="模型不存在或已卸载")
    return R.success(msg="模型已卸载")


@router.post("/transcriber_download")
def download_transcriber_model(data: ModelDownloadRequest, background_tasks: BackgroundTasks):
    """触发后台下载指定的转写模型（whisper / mlx-whisper / funasr）。"""
    # FunASR：model_size 字段承载 FunASR 模型名（复用既有请求结构）
    if data.transcriber_type == "funasr":
        if data.model_size not in FUNASR_MODEL_REPOS:
            return R.error(msg=f"不支持预下载的 FunASR 模型: {data.model_size}")
        key = f"funasr-{data.model_size}"
        if _downloading.get(key) == "downloading":
            return R.success(msg="模型正在下载中")
        background_tasks.add_task(_do_download_funasr, data.model_size)
        return R.success(msg="模型下载已开始")

    if data.model_size not in WHISPER_MODEL_SIZES:
        return R.error(msg=f"不支持的模型大小: {data.model_size}")

    if data.transcriber_type == "mlx-whisper":
        if platform.system() != "Darwin":
            return R.error(msg="MLX Whisper 仅支持 macOS")
        key = f"mlx-{data.model_size}"
        if _downloading.get(key) == "downloading":
            return R.success(msg="模型正在下载中")
        background_tasks.add_task(_do_download_mlx_whisper, data.model_size)
    else:
        if _downloading.get(data.model_size) == "downloading":
            return R.success(msg="模型正在下载中")
        background_tasks.add_task(_do_download_whisper, data.model_size)

    return R.success(msg="模型下载已开始")


@router.get("/sys_health")
async def sys_health():
    """结构化健康状态——任何子项异常都不应让整个 endpoint 5xx。

    每个字段：'ok' | 'missing' | 'error'。
    前端 useCheckBackend 用 /sys_check 做存活判定（不依赖外部依赖），
    /sys_health 用来在设置页区分「后端没起」vs「后端起了但 ffmpeg 缺」vs「DB 写不进去」等更细的状态。
    """
    ffmpeg_status = "ok"
    try:
        ensure_ffmpeg_or_raise()
    except Exception:
        ffmpeg_status = "missing"

    db_status = "ok"
    try:
        from app.db.engine import engine
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        db_status = "error"

    # 当前转写器配置 + 模型是否已下载（用 model.bin 落盘判定，与 transcriber 加载逻辑一致）
    whisper_info: dict = {"size": None, "type": None, "downloaded": False, "checked": False}
    try:
        cfg = transcriber_config_manager.get_config()
        size = cfg["whisper_model_size"]
        ttype = cfg["transcriber_type"]
        whisper_info["size"] = size
        whisper_info["type"] = ttype
        # 只有本地引擎才有「下载」概念；groq / bcut / kuaishou 在线引擎跳过
        if ttype == "fast-whisper":
            whisper_info["downloaded"] = _check_whisper_model_exists(size, "whisper")
            whisper_info["checked"] = True
        elif ttype == "mlx-whisper":
            whisper_info["downloaded"] = _check_mlx_whisper_model_exists(size)
            whisper_info["checked"] = True
    except Exception:
        pass

    return R.success(data={
        "backend": "ok",
        "ffmpeg": ffmpeg_status,
        "db": db_status,
        "whisper_model": whisper_info,
    })


@router.get("/sys_check")
async def sys_check():
    """轻量存活判定：后端进程能响应这个 endpoint 就算「起来了」，不查外部依赖。

    给桌面端 useCheckBackend / Tauri ready-probe 用。
    """
    return R.success()


@router.get("/deploy_status")
async def deploy_status():
    """返回部署监控所需的所有状态信息。

    所有子项都用 try 包起来——监控页本身不应该被任何一个子项打死。
    特别是 torch：它只在 fast-whisper 路径用得到，用 Groq / 必剪 / 快手在线
    引擎的轻量部署完全可以不装，那种情况这个 endpoint 不应该 500。
    """
    import os

    # CUDA 状态
    try:
        import torch
        cuda_available = torch.cuda.is_available()
        cuda_info = {
            "available": cuda_available,
            "torch_installed": True,
            "version": torch.version.cuda if cuda_available else None,
            "gpu_name": torch.cuda.get_device_name(0) if cuda_available else None,
        }
    except Exception:
        cuda_info = {
            "available": False,
            "torch_installed": False,
            "version": None,
            "gpu_name": None,
        }

    # Whisper 模型 / 转写器配置 + 本地下载状态
    try:
        transcriber_cfg = transcriber_config_manager.get_config()
        size = transcriber_cfg["whisper_model_size"]
        ttype = transcriber_cfg["transcriber_type"]
        if ttype == "fast-whisper":
            downloaded = _check_whisper_model_exists(size, "whisper")
        elif ttype == "mlx-whisper":
            downloaded = _check_mlx_whisper_model_exists(size)
        else:
            downloaded = False  # 在线引擎无下载概念
        whisper_info = {
            "model_size": size,
            "transcriber_type": ttype,
            "downloaded": downloaded,
        }
    except Exception:
        whisper_info = {"model_size": None, "transcriber_type": None, "downloaded": False}

    # FFmpeg 状态
    try:
        ensure_ffmpeg_or_raise()
        ffmpeg_ok = True
    except Exception:
        ffmpeg_ok = False

    return R.success(data={
        "backend": {"status": "running", "port": int(os.getenv("BACKEND_PORT", 8483))},
        "cuda": cuda_info,
        "whisper": whisper_info,
        "ffmpeg": {"available": ffmpeg_ok},
    })
