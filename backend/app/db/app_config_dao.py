"""app_config 键值配置表的读写。

取代原先各 *_config_manager 的 config/*.json 文件存储。各 manager 的公开方法
（get_config/update_config/get/set/list_all 等）签名与行为不变，只是底层 _read/_write
改调这里，从而让配置随 Postgres 持久化、HF 容器重启不丢。

兼容旧库：首次读某个 key 时若数据库里还没有、但旧的 config/<x>.json 文件存在，
就把文件内容一次性导入数据库后返回（幂等）。这样桌面端 / 本地 SQLite 的既有配置不丢。
"""
import json
from pathlib import Path
from typing import Any, Optional

from app.db.engine import SessionLocal
from app.db.models.app_config import AppConfig


def get_value(key: str) -> Optional[Any]:
    """读某个配置域的整份 value（dict 或 list）；不存在返回 None。

    容错：启动早期（路由在 init_db 建表前就被 import，某些下载器会在导入期读 cookie 配置）
    或数据库暂不可用时，按「无配置」返回 None，而不是抛错——与旧的「文件不存在/读失败返回 {}」
    语义一致，避免把启动 import 链炸掉。
    """
    try:
        with SessionLocal() as db:
            row = db.get(AppConfig, key)
            return row.value if row is not None else None
    except Exception:
        return None


def set_value(key: str, value: Any) -> None:
    """整份覆盖某个配置域的 value（upsert）。"""
    with SessionLocal() as db:
        row = db.get(AppConfig, key)
        if row is None:
            db.add(AppConfig(key=key, value=value))
        else:
            row.value = value
        db.commit()


def _read_legacy_file(legacy_path: str) -> Optional[Any]:
    p = Path(legacy_path)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def load_value(key: str, legacy_path: Optional[str] = None, default: Any = None) -> Any:
    """读配置；数据库没有但旧 JSON 文件存在则一次性导入后返回；都没有返回 default。"""
    value = get_value(key)
    if value is not None:
        return value
    if legacy_path:
        legacy = _read_legacy_file(legacy_path)
        if legacy is not None:
            try:
                set_value(key, legacy)
            except Exception:
                # 表尚未就绪（早期 import）时先返回文件内容，待 init_db 后下次读再持久化
                pass
            return legacy
    return default
