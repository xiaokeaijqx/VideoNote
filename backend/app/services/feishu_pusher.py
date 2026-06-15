from __future__ import annotations

import logging
from typing import Any, Dict, Optional

from app.services.feishu_cli_service import FeishuCliService
from app.services.feishu_config_manager import FeishuConfigManager
from app.services.feishu_service import FeishuError, FeishuService

logger = logging.getLogger(__name__)


def resolve_backend(cfg: Dict[str, Any]) -> str:
    """把配置里的 push_backend 解析成实际使用的引擎：'rest' 或 'cli'。

    - rest / cli：按用户显式选择；
    - auto：环境里有 lark-cli 且配了凭证就走 CLI，否则回退 REST。
    """
    backend = (cfg.get("push_backend") or "auto").lower()
    if backend in ("rest", "cli"):
        return backend
    # auto
    try:
        if cfg.get("app_id") and cfg.get("app_secret") and FeishuCliService(cfg).is_available():
            return "cli"
    except Exception:
        pass
    return "rest"


def push_markdown(
    title: str,
    markdown: str,
    image_base_url: Optional[str] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """按配置选择引擎推送笔记。auto 模式下 CLI 失败会自动回落到 REST。"""
    cfg = config or FeishuConfigManager().get_config()
    backend = resolve_backend(cfg)

    if backend == "cli":
        try:
            return FeishuCliService(cfg).push_markdown(title, markdown, image_base_url)
        except FeishuError:
            # 仅 auto 模式才回落；显式选 cli 时把错误抛给用户，避免「以为走了 CLI 其实没走」
            if (cfg.get("push_backend") or "auto").lower() == "auto":
                logger.warning("lark-cli 推送失败，回落到 REST 直连导入")
                return FeishuService(cfg).push_markdown(title, markdown, image_base_url)
            raise

    return FeishuService(cfg).push_markdown(title, markdown, image_base_url)


def test_connection(config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """按当前引擎做连通性/凭证校验，返回 {success, message, backend}。"""
    cfg = config or FeishuConfigManager().get_config()
    backend = resolve_backend(cfg)

    # 显式选 cli 时 resolve_backend 必返回 'cli'（即便没装），由 CLI 服务给出「未找到 lark-cli」的明确报错
    if backend == "cli":
        res = FeishuCliService(cfg).test_connection()
    else:
        res = FeishuService(cfg).test_connection()

    res["backend"] = backend
    return res
