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
    # 模型大小变更时重建实例：单例只按类型缓存，否则设置页切换 size 不生效
    inst = _transcribers[TranscriberType.FAST_WHISPER]
    if inst is not None and getattr(inst, "model_size", None) != model_size:
        logger.info(f"fast-whisper 模型大小变更 {getattr(inst, 'model_size', None)} -> {model_size}，重建实例")
        _transcribers[TranscriberType.FAST_WHISPER] = None
    return _init_transcriber(TranscriberType.FAST_WHISPER, WhisperTranscriber, model_size=model_size, device=device)

def get_bcut_transcriber():
    return _init_transcriber(TranscriberType.BCUT, BcutTranscriber)

def get_kuaishou_transcriber():
    return _init_transcriber(TranscriberType.KUAISHOU, KuaishouTranscriber)

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

    # fallback
    logger.warning(f'未识别转录器类型 "{transcriber_type}"，使用 fast-whisper 作为默认')
    return get_whisper_transcriber(whisper_model_size, device=device)
