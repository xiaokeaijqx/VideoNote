import os
import re
from typing import Any, Dict, Optional

from app.db.app_config_dao import load_value, set_value

# 飞书 / Lark 开放平台默认域名。海外租户用 open.larksuite.com，
# 国内租户用 open.feishu.cn（默认）。用户可在设置页切换。
DEFAULT_FEISHU_BASE_URL = "https://open.feishu.cn"


def _extract_wiki_token(value: str) -> str:
    """从飞书知识库链接或原始 token 取出 wiki 节点 token。

    支持直接粘贴整条链接（https://xxx.feishu.cn/wiki/XmOJ...）或只填 token。
    """
    v = (value or "").strip()
    if not v:
        return ""
    m = re.search(r"/wiki/([A-Za-z0-9]+)", v)
    if m:
        return m.group(1)
    return v.split("?")[0].split("/")[-1].strip()


class FeishuConfigManager:
    """飞书（Lark）文档推送配置，存 JSON 文件，前端可动态修改。

    存自建应用凭证（app_id / app_secret）、目标文件夹 token、是否自动推送等。
    app_secret 属敏感信息，只落本地配置文件（与 cookie 等本地凭证一致），
    返回给前端时通过 get_public_config() 隐去明文。
    """

    # 配置现在持久化在数据库 app_config 表（key="feishu"）。filepath 仅用于把旧的
    # config/feishu.json 一次性导入数据库，保证桌面端/本地库的既有配置不丢。
    _KEY = "feishu"

    def __init__(self, filepath: str = "config/feishu.json"):
        self._legacy_path = filepath

    def _read(self) -> Dict[str, Any]:
        return load_value(self._KEY, self._legacy_path, {}) or {}

    def _write(self, data: Dict[str, Any]):
        set_value(self._KEY, data)

    def get_config(self) -> Dict[str, Any]:
        """内部使用：含 app_secret 明文。"""
        data = self._read()
        base_url = (data.get("base_url") or "").strip() or os.getenv(
            "FEISHU_BASE_URL", DEFAULT_FEISHU_BASE_URL
        )
        # 推送引擎：rest=直连开放平台（默认，可靠、同一把 key、无需 lark-cli）；
        # cli=强制走 lark-cli；auto=有 lark-cli 就用 CLI 否则回退 REST。
        # 默认用 rest：lark-cli 的 docs +create --markdown 在部分版本会把笔记截成首行
        # （issue #82），且截断不报错、auto 无法自动回退，所以让用户显式 opt-in CLI。
        backend = (data.get("push_backend") or "rest").strip().lower()
        if backend not in ("auto", "rest", "cli"):
            backend = "rest"
        return {
            "enabled": bool(data.get("enabled", False)),
            "auto_push": bool(data.get("auto_push", False)),
            "app_id": (data.get("app_id") or "").strip(),
            "app_secret": (data.get("app_secret") or "").strip(),
            "folder_token": (data.get("folder_token") or "").strip(),
            # 知识库节点 token：填了就把笔记导入到该 wiki 节点下（否则导入云空间文件夹）
            "wiki_token": _extract_wiki_token(data.get("wiki_token") or ""),
            "base_url": base_url.rstrip("/"),
            "push_backend": backend,
            "cli_path": (data.get("cli_path") or "lark-cli").strip() or "lark-cli",
        }

    def get_public_config(self) -> Dict[str, Any]:
        """给前端展示：隐去 app_secret 明文，只回 app_secret_set 表示是否已配置。"""
        cfg = self.get_config()
        has_secret = bool(cfg.pop("app_secret", ""))
        cfg["app_secret_set"] = has_secret
        cfg["configured"] = bool(cfg["app_id"] and has_secret)
        return cfg

    def update_config(
        self,
        enabled: Optional[bool] = None,
        auto_push: Optional[bool] = None,
        app_id: Optional[str] = None,
        app_secret: Optional[str] = None,
        folder_token: Optional[str] = None,
        wiki_token: Optional[str] = None,
        base_url: Optional[str] = None,
        push_backend: Optional[str] = None,
        cli_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        data = self._read()
        if enabled is not None:
            data["enabled"] = bool(enabled)
        if auto_push is not None:
            data["auto_push"] = bool(auto_push)
        if app_id is not None:
            data["app_id"] = app_id.strip()
        # app_secret 仅在传入非空时覆盖：前端不回显明文，留空 == 不修改，
        # 避免「只改了别的字段」时把已存的密钥清空。
        if app_secret is not None and app_secret.strip():
            data["app_secret"] = app_secret.strip()
        if folder_token is not None:
            data["folder_token"] = folder_token.strip()
        if wiki_token is not None:
            data["wiki_token"] = _extract_wiki_token(wiki_token)
        if base_url is not None:
            data["base_url"] = base_url.strip()
        if push_backend is not None:
            pb = push_backend.strip().lower()
            if pb in ("auto", "rest", "cli"):
                data["push_backend"] = pb
        if cli_path is not None:
            data["cli_path"] = cli_path.strip()
        self._write(data)
        return self.get_public_config()

    def is_configured(self) -> bool:
        cfg = self.get_config()
        return bool(cfg["app_id"] and cfg["app_secret"])

    def is_auto_push_enabled(self) -> bool:
        cfg = self.get_config()
        return bool(cfg["enabled"] and cfg["auto_push"] and cfg["app_id"] and cfg["app_secret"])
