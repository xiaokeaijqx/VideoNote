import os
from typing import Any, Dict, Optional

from app.db.app_config_dao import load_value, set_value


class ProxyConfigManager:
    """全局代理配置，存 JSON 文件，支持前端动态修改。

    作用范围：LLM API + 转写 API（Groq 等）+ yt-dlp 视频下载。
    优先级：配置文件里 enabled=true 的 url > 环境变量 HTTP_PROXY/HTTPS_PROXY/ALL_PROXY。
    这样桌面端/web 用户在设置页填，docker/服务器部署用环境变量兜底。
    """

    # 配置持久化在数据库 app_config 表（key="proxy"）；filepath 仅用于旧文件一次性导入。
    _KEY = "proxy"

    def __init__(self, filepath: str = "config/proxy.json"):
        self._legacy_path = filepath

    def _read(self) -> Dict[str, Any]:
        return load_value(self._KEY, self._legacy_path, {}) or {}

    def _write(self, data: Dict[str, Any]):
        set_value(self._KEY, data)

    def get_config(self) -> Dict[str, Any]:
        data = self._read()
        return {
            "enabled": bool(data.get("enabled", False)),
            "url": data.get("url", "") or "",
        }

    def update_config(self, enabled: bool, url: Optional[str] = None) -> Dict[str, Any]:
        data = self._read()
        data["enabled"] = bool(enabled)
        if url is not None:
            data["url"] = url.strip()
        self._write(data)
        return self.get_config()

    def get_proxy_url(self) -> Optional[str]:
        """返回当前生效的代理 URL；没有则 None。

        - 配置文件 enabled=true 且 url 非空 → 用配置的 url
        - 否则回退到环境变量（标准的 HTTP_PROXY / HTTPS_PROXY / ALL_PROXY，大小写都认）
        """
        cfg = self.get_config()
        if cfg["enabled"] and cfg["url"]:
            return cfg["url"]
        for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
            val = os.environ.get(key)
            if val:
                return val
        return None
