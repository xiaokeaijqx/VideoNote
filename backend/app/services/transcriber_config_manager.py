import os
from typing import Optional, Dict, Any

from app.db.app_config_dao import load_value, set_value


class TranscriberConfigManager:
    """管理转写器配置，持久化在数据库 app_config 表（key="transcriber"），支持前端动态修改。"""

    # filepath 仅用于把旧的 config/transcriber.json 一次性导入数据库。
    _KEY = "transcriber"

    def __init__(self, filepath: str = "config/transcriber.json"):
        self._legacy_path = filepath

    def _read(self) -> Dict[str, Any]:
        return load_value(self._KEY, self._legacy_path, {}) or {}

    def _write(self, data: Dict[str, Any]):
        set_value(self._KEY, data)

    def get_config(self) -> Dict[str, Any]:
        """获取当前转写器配置，fallback 到环境变量默认值。

        whisper 默认 size 从 'medium' (~1.5GB) 改为 'tiny' (~75MB)：
        新装用户没主动设置时不应该被首次下载卡住。想要更高精度可在「音频转写配置」
        页主动切换。
        """
        data = self._read()
        ttype = data.get(
            "transcriber_type",
            os.getenv("TRANSCRIBER_TYPE", "fast-whisper"),
        )
        size = data.get(
            "whisper_model_size",
            os.getenv("WHISPER_MODEL_SIZE", "tiny"),
        )
        # 防御：存储/环境变量里的值不在可选列表时回退到第一个，
        # 避免前端下拉框初始化为空或指向不存在的引擎/模型
        if ttype not in ("fast-whisper", "bcut", "kuaishou", "groq", "mlx-whisper", "funasr"):
            ttype = "fast-whisper"
        # "custom" 表示用户自定义本地/HF whisper 模型（路径见 whisper_custom_model）
        if size not in ("tiny", "base", "small", "medium", "large-v3", "large-v3-turbo", "custom"):
            size = "tiny"
        return {
            "transcriber_type": ttype,
            "whisper_model_size": size,
            # 自定义 whisper 模型：本地 CTranslate2 目录 或 HF 仓库 id
            "whisper_custom_model": (data.get("whisper_custom_model") or "").strip(),
            # FunASR 模型名/路径（modelscope id 或本地目录），默认中文 paraformer-zh
            "funasr_model": (data.get("funasr_model") or "paraformer-zh").strip(),
        }

    def update_config(
        self,
        transcriber_type: str,
        whisper_model_size: Optional[str] = None,
        whisper_custom_model: Optional[str] = None,
        funasr_model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """更新转写器配置并持久化。"""
        data = self._read()
        data["transcriber_type"] = transcriber_type
        if whisper_model_size is not None:
            data["whisper_model_size"] = whisper_model_size
        if whisper_custom_model is not None:
            data["whisper_custom_model"] = whisper_custom_model.strip()
        if funasr_model is not None:
            data["funasr_model"] = funasr_model.strip()
        self._write(data)
        return self.get_config()

    def get_transcriber_type(self) -> str:
        return self.get_config()["transcriber_type"]

    def get_whisper_model_size(self) -> str:
        return self.get_config()["whisper_model_size"]

    def is_model_ready(self) -> Dict[str, Any]:
        """当前转写器是否就绪可用。

        返回 {ready, transcriber_type, model_size, downloading, reason}：
          - 在线引擎 (groq/bcut/kuaishou)：永远 ready（不需要本地模型）
          - fast-whisper：检查 whisper-{size}/model.bin 落盘
          - mlx-whisper：检查 {repo_id}/config.json 落盘
        给 /generate_note 入口做「开始视频前先确认模型下载好」的门禁用。
        """
        cfg = self.get_config()
        ttype = cfg["transcriber_type"]
        size = cfg["whisper_model_size"]
        result = {
            "ready": True,
            "transcriber_type": ttype,
            "model_size": size,
            "downloading": False,
            "reason": "",
        }
        # FunASR：可选引擎，需安装 funasr+torch。模型经 modelscope 首跑自动下载，
        # 不做预下载门禁，只确认引擎可用，否则给安装指引。
        if ttype == "funasr":
            try:
                from app.transcriber.transcriber_provider import FUNASR_AVAILABLE
            except Exception:
                FUNASR_AVAILABLE = True  # 检查不了就放行，交给后续流程报错
            if not FUNASR_AVAILABLE:
                result["ready"] = False
                result["reason"] = (
                    "FunASR 引擎当前不可用（未安装）。请安装依赖："
                    "pip install funasr torch torchaudio，安装后重启后端；或切换到其他转写引擎。"
                )
            return result

        if ttype not in ("fast-whisper", "mlx-whisper"):
            return result  # 在线引擎无需本地模型

        # fast-whisper 自定义模型：路径/仓库 id 由用户自负，本地目录存在即就绪；
        # 仓库 id 也放行（首跑联网下载），不进预设档位的下载门禁。
        if ttype == "fast-whisper" and size == "custom":
            custom = cfg.get("whisper_custom_model") or ""
            if not custom:
                result["ready"] = False
                result["reason"] = "已选「自定义」Whisper 模型，但未填写模型路径或仓库 id。"
            return result

        # mlx-whisper 还要求引擎本身可用（包已安装且原生库能加载）。
        # 配置可能是在引擎可用时保存的，之后换了环境/重装应用就失效了——
        # 在这里拦下并给出可行动的指引，而不是让 NoteGenerator 初始化时 500。
        if ttype == "mlx-whisper":
            try:
                from app.transcriber.transcriber_provider import MLX_WHISPER_AVAILABLE
            except Exception:
                MLX_WHISPER_AVAILABLE = True  # 检查不了就放行，交给后续流程报错
            if not MLX_WHISPER_AVAILABLE:
                result["ready"] = False
                result["reason"] = (
                    "MLX Whisper 引擎当前不可用（未安装或本机不支持）。"
                    "请到「设置 → 音频转写配置」按页面提示安装 mlx_whisper 后重启应用，"
                    "或切换到其他转写引擎。"
                )
                return result

        # 延迟 import 避免与 routers.config 的循环依赖；只取纯函数，不触发路由副作用
        try:
            from app.routers.config import (
                _check_whisper_model_exists,
                _check_mlx_whisper_model_exists,
                _downloading,
            )
        except Exception as e:
            # 拿不到检查函数时保守放行，不要把用户卡死
            result["reason"] = f"无法检查模型状态: {e}"
            return result

        if ttype == "fast-whisper":
            downloaded = _check_whisper_model_exists(size, "whisper")
            downloading = _downloading.get(size) == "downloading"
        else:  # mlx-whisper
            downloaded = _check_mlx_whisper_model_exists(size)
            downloading = _downloading.get(f"mlx-{size}") == "downloading"

        result["downloading"] = downloading
        if downloaded:
            return result
        result["ready"] = False
        result["reason"] = (
            f"转写模型 {ttype} / {size} 尚未下载就绪"
            + ("，正在下载中，请稍候" if downloading else "，请先在「设置 → 音频转写配置」页下载")
        )
        return result
