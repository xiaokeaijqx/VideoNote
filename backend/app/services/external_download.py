"""外部下载（家用 worker）路由策略 + worker 心跳。

某些平台（默认 YouTube）在机房 IP 上会被风控，改由跑在住宅 IP 上的家用 worker
拉取下载。这里集中：是否该走外部下载、worker 是否在线。

配置存 app_config（key="external_downloader"）：{enabled: bool, platforms: [str]}。
默认开启、只对 youtube 生效——启动了 worker 就能用；没启动则入口会提示先开 worker。
"""
import time
from typing import Dict, Any

from app.db import app_config_dao

_KEY = "external_downloader"
_DEFAULT = {"enabled": True, "platforms": ["youtube"]}

# worker 最近一次轮询的时间戳（进程内存；HF 重启清零，worker 几秒一轮很快回填）
_last_seen = {"ts": 0.0}


def get_config() -> Dict[str, Any]:
    cfg = app_config_dao.get_value(_KEY) or {}
    return {
        "enabled": bool(cfg.get("enabled", _DEFAULT["enabled"])),
        "platforms": cfg.get("platforms") or _DEFAULT["platforms"],
    }


def set_config(enabled: bool, platforms) -> Dict[str, Any]:
    app_config_dao.set_value(_KEY, {"enabled": bool(enabled), "platforms": list(platforms or [])})
    return get_config()


def should_external(platform: str) -> bool:
    cfg = get_config()
    return cfg["enabled"] and platform in cfg["platforms"]


def mark_worker_seen() -> None:
    _last_seen["ts"] = time.time()


def worker_alive(within: float = 90.0) -> bool:
    return (time.time() - _last_seen["ts"]) < within
