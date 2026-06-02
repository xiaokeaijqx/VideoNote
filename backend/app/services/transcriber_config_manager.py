import json
import os
from pathlib import Path
from typing import Optional, Dict, Any


class TranscriberConfigManager:
    """管理转写器配置，存储在 JSON 文件中，支持前端动态修改。"""

    def __init__(self, filepath: str = "config/transcriber.json"):
        self.path = Path(filepath)
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def _read(self) -> Dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            with self.path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _write(self, data: Dict[str, Any]):
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

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
        if ttype not in ("fast-whisper", "bcut", "kuaishou", "groq", "mlx-whisper"):
            ttype = "fast-whisper"
        if size not in ("tiny", "base", "small", "medium", "large-v3", "large-v3-turbo"):
            size = "tiny"
        return {
            "transcriber_type": ttype,
            "whisper_model_size": size,
        }

    def update_config(
        self,
        transcriber_type: str,
        whisper_model_size: Optional[str] = None,
    ) -> Dict[str, Any]:
        """更新转写器配置并持久化。"""
        data = self._read()
        data["transcriber_type"] = transcriber_type
        if whisper_model_size is not None:
            data["whisper_model_size"] = whisper_model_size
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
        if ttype not in ("fast-whisper", "mlx-whisper"):
            return result  # 在线引擎无需本地模型

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
