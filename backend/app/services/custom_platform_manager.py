"""自定义平台管理：用户在 UI 里登记的额外平台条目。

每条记录形如 { key, name, match }：
  - key:   平台唯一标识，作为 NoteGenerator._get_downloader 的 platform 入参；
           Cookie 也用同样的 key 存到现有 CookieConfigManager（无需新存储）。
  - name:  展示名。
  - match: URL 子串匹配。如 "vimeo.com"。命中即视为该平台。
"""
import re
from typing import Optional

from app.db.app_config_dao import load_value, set_value


# 自定义平台持久化在数据库 app_config 表（key="custom_platforms"，value 是列表）。
# _LEGACY_PATH 仅用于把旧的 config/custom_platforms.json 一次性导入。
_KEY = "custom_platforms"
_LEGACY_PATH = "config/custom_platforms.json"
_KEY_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,31}$")


def _read() -> list[dict]:
    data = load_value(_KEY, _LEGACY_PATH, [])
    # 兼容旧文件 {"platforms": [...]} 的形态（导入后首次读到的就是这个 dict）。
    if isinstance(data, dict):
        data = data.get("platforms", [])
    return [p for p in (data or []) if isinstance(p, dict) and p.get("key")]


def _write(items: list[dict]) -> None:
    set_value(_KEY, items)


def list_all() -> list[dict]:
    return _read()


def get(key: str) -> Optional[dict]:
    for p in _read():
        if p.get("key") == key:
            return p
    return None


def upsert(key: str, name: str, match: str) -> dict:
    """创建或更新自定义平台。key 不可改（作为身份），name/match 可改。"""
    key = (key or "").strip().lower()
    if not _KEY_RE.match(key):
        raise ValueError("平台标识只能是 2~32 位的小写字母、数字、下划线或短横线")
    if key in {"youtube", "bilibili", "douyin", "kuaishou", "xiaohongshu", "tiktok", "local"}:
        raise ValueError(f"标识 {key!r} 与内建平台冲突")
    name = (name or "").strip() or key
    match = (match or "").strip()
    if not match:
        raise ValueError("URL 匹配规则不能为空")

    items = _read()
    found = False
    for p in items:
        if p["key"] == key:
            p["name"], p["match"] = name, match
            found = True
            break
    if not found:
        items.append({"key": key, "name": name, "match": match})
    _write(items)
    return next(p for p in items if p["key"] == key)


def delete(key: str) -> bool:
    items = _read()
    new_items = [p for p in items if p.get("key") != key]
    if len(new_items) == len(items):
        return False
    _write(new_items)
    return True


def match_custom_platform(url: str) -> Optional[dict]:
    """URL → 自定义平台条目。返回首个 match 命中的项。"""
    if not url:
        return None
    for p in _read():
        m = (p.get("match") or "").strip()
        if m and m in url:
            return p
    return None
