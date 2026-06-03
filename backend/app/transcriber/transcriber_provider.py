import importlib.util
import os
import platform
from enum import Enum

from app.transcriber.groq import GroqTranscriber
from app.transcriber.whisper import WhisperTranscriber
from app.transcriber.bcut import BcutTranscriber
from app.transcriber.kuaishou import KuaishouTranscriber
from app.utils.logger import get_logger

logger = get_logger(__name__)

class TranscriberType(str, Enum):
    FAST_WHISPER = "fast-whisper"
    MLX_WHISPER = "mlx-whisper"
    BCUT = "bcut"
    KUAISHOU = "kuaishou"
    GROQ = "groq"
    FUNASR = "funasr"

# FunASR 可选引擎：用 find_spec 探测是否安装，绝不在此 import（import funasr 会连带加载
# torch，拖慢启动且桌面瘦身包没有 torch）。真正用到时才在 FunASRTranscriber 内部 import。
# 桌面冻结包强制不可用：torch 无法在 PyInstaller 冻结运行时初始化（pybind 重复注册崩溃），
# 而且装进插件目录后会被 ctranslate2 的启动链路自动 import，直接把应用打挂。
import sys as _sys
FUNASR_AVAILABLE = (
    not getattr(_sys, "frozen", False)
    and importlib.util.find_spec("funasr") is not None
)
if FUNASR_AVAILABLE:
    logger.info("FunASR 可用（已安装 funasr）")

# 在 Apple 平台尝试导入 MLX Whisper（不再依赖环境变量，支持前端动态切换）
MLX_WHISPER_AVAILABLE = False
if platform.system() == "Darwin":
    try:
        from app.transcriber.mlx_whisper_transcriber import MLXWhisperTranscriber
        MLX_WHISPER_AVAILABLE = True
        logger.info("MLX Whisper 可用，已导入")
    except ImportError:
        logger.warning("MLX Whisper 导入失败，可能未安装 mlx_whisper")

logger.info('初始化转录服务提供器')

# 转录器单例缓存
_transcribers = {
    TranscriberType.FAST_WHISPER: None,
    TranscriberType.MLX_WHISPER: None,
    TranscriberType.BCUT: None,
    TranscriberType.KUAISHOU: None,
    TranscriberType.GROQ: None,
    TranscriberType.FUNASR: None,
}

# 公共实例初始化函数
def _init_transcriber(key: TranscriberType, cls, *args, **kwargs):
    if _transcribers[key] is None:
        logger.info(f'创建 {cls.__name__} 实例: {key}')
        try:
            _transcribers[key] = cls(*args, **kwargs)
            logger.info(f'{cls.__name__} 创建成功')
        except Exception as e:
            logger.error(f"{cls.__name__} 创建失败: {e}")
            raise
    return _transcribers[key]

# 各类型获取方法
def get_groq_transcriber():
    return _init_transcriber(TranscriberType.GROQ, GroqTranscriber)

def get_whisper_transcriber(model_size="base", device="cuda"):
    # size == "custom"：使用用户在「音频转写配置」填的自定义模型（本地目录 / HF 仓库 id）
    custom_path = None
    if model_size == "custom":
        from app.services.transcriber_config_manager import TranscriberConfigManager
        custom_path = (TranscriberConfigManager().get_config().get("whisper_custom_model") or "").strip()
        if not custom_path:
            raise RuntimeError("已选择「自定义」Whisper 模型，但未填写模型路径或仓库 id；请到「音频转写配置」填写。")

    # 实例「变化即重建」：自定义时按路径比较，否则按档位比较
    target_key = custom_path if model_size == "custom" else model_size
    inst = _transcribers[TranscriberType.FAST_WHISPER]
    if inst is not None and getattr(inst, "model_size", None) != target_key:
        logger.info(f"fast-whisper 模型变更 {getattr(inst, 'model_size', None)} -> {target_key}，重建实例")
        _transcribers[TranscriberType.FAST_WHISPER] = None

    if model_size == "custom":
        return _init_transcriber(TranscriberType.FAST_WHISPER, WhisperTranscriber, model_path=custom_path, device=device)
    return _init_transcriber(TranscriberType.FAST_WHISPER, WhisperTranscriber, model_size=model_size, device=device)

def get_bcut_transcriber():
    return _init_transcriber(TranscriberType.BCUT, BcutTranscriber)

def get_kuaishou_transcriber():
    return _init_transcriber(TranscriberType.KUAISHOU, KuaishouTranscriber)

def get_funasr_transcriber(model: str = None):
    if not FUNASR_AVAILABLE:
        raise RuntimeError(
            "FunASR 不可用：请先安装依赖（pip install funasr torch torchaudio），"
            "安装后重启后端；或在「音频转写配置」页面切换到其他转写引擎。"
        )
    # 模型名变更时重建实例（用户可在设置页填自定义 FunASR 模型）
    inst = _transcribers[TranscriberType.FUNASR]
    if inst is not None and getattr(inst, "model_name", None) != (model or "paraformer-zh"):
        logger.info(f"FunASR 模型变更 {getattr(inst, 'model_name', None)} -> {model}，重建实例")
        _transcribers[TranscriberType.FUNASR] = None
    # 延迟 import，避免模块加载阶段触发 torch
    from app.transcriber.funasr_transcriber import FunASRTranscriber
    return _init_transcriber(TranscriberType.FUNASR, FunASRTranscriber, model=model)


def get_mlx_whisper_transcriber(model_size="base"):
    if not MLX_WHISPER_AVAILABLE:
        logger.warning("MLX Whisper 不可用，请确保在 Apple 平台且已安装 mlx_whisper")
        raise ImportError("MLX Whisper 不可用")
    # 模型大小变更时重建实例：单例只按类型缓存，否则设置页切换 size 不生效
    inst = _transcribers[TranscriberType.MLX_WHISPER]
    if inst is not None and getattr(inst, "model_size", None) != model_size:
        logger.info(f"mlx-whisper 模型大小变更 {getattr(inst, 'model_size', None)} -> {model_size}，重建实例")
        _transcribers[TranscriberType.MLX_WHISPER] = None
    return _init_transcriber(TranscriberType.MLX_WHISPER, MLXWhisperTranscriber, model_size=model_size)

# 通用入口
def get_transcriber(transcriber_type="fast-whisper", model_size=None, device="cuda"):
    """
    获取指定类型的转录器实例

    参数:
        transcriber_type: 支持 "fast-whisper", "mlx-whisper", "bcut", "kuaishou", "groq"
        model_size: 模型大小，适用于 whisper 类；不传时回退到环境变量 WHISPER_MODEL_SIZE
        device: 设备类型（如 cuda / cpu），仅 whisper 使用

    返回:
        对应类型的转录器实例
    """
    logger.info(f'请求转录器类型: {transcriber_type}, 模型大小: {model_size or "(默认)"}')

    try:
        transcriber_enum = TranscriberType(transcriber_type)
    except ValueError:
        logger.warning(f'未知转录器类型 "{transcriber_type}"，默认使用 fast-whisper')
        transcriber_enum = TranscriberType.FAST_WHISPER

    # 显式入参优先（来自「音频转写配置」页持久化的配置），环境变量只做未传参时的默认值。
    # 旧逻辑是环境变量覆盖入参，导致设置页选的模型大小永远被 .env 里的值顶掉。
    whisper_model_size = model_size or os.environ.get("WHISPER_MODEL_SIZE", "base")

    if transcriber_enum == TranscriberType.FAST_WHISPER:
        return get_whisper_transcriber(whisper_model_size, device=device)

    elif transcriber_enum == TranscriberType.MLX_WHISPER:
        if not MLX_WHISPER_AVAILABLE:
            import sys
            if getattr(sys, "frozen", False):
                from app.utils.path_helper import get_plugin_packages_dir
                hint = (
                    f'请在终端执行：python3.11 -m pip install --target '
                    f'"{get_plugin_packages_dir()}" mlx_whisper（需要 Python 3.11），'
                    "安装后重启应用生效；"
                )
            else:
                hint = "请安装 mlx_whisper 包（pip install mlx_whisper）后重启后端；"
            raise RuntimeError(
                f"MLX Whisper 不可用：需要 macOS（Apple Silicon）平台。{hint}"
                "或在「音频转写配置」页面切换到其他转写引擎。"
            )
        return get_mlx_whisper_transcriber(whisper_model_size)

    elif transcriber_enum == TranscriberType.BCUT:
        return get_bcut_transcriber()

    elif transcriber_enum == TranscriberType.KUAISHOU:
        return get_kuaishou_transcriber()

    elif transcriber_enum == TranscriberType.GROQ:
        return get_groq_transcriber()

    elif transcriber_enum == TranscriberType.FUNASR:
        from app.services.transcriber_config_manager import TranscriberConfigManager
        funasr_model = TranscriberConfigManager().get_config().get("funasr_model") or "paraformer-zh"
        return get_funasr_transcriber(model=funasr_model)

    # fallback
    logger.warning(f'未识别转录器类型 "{transcriber_type}"，使用 fast-whisper 作为默认')
    return get_whisper_transcriber(whisper_model_size, device=device)
