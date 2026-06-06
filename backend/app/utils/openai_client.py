"""统一构造 OpenAI 兼容客户端：注入全局代理 + 校验 api_key。

为什么要这一层：
  - 代理：openai SDK 默认只认进程级 HTTP_PROXY 环境变量，桌面端用户在 UI 里
    填的代理需要显式塞进 httpx.Client 才生效。
  - api_key 校验：空 key 会让 httpx 拼出非法 header `Bearer `，抛出
    `httpx.LocalProtocolError: Illegal header value b'Bearer '` 这种天书报错。
    在入口挡掉，给用户「xxx 的 API Key 未配置」这种能看懂的提示。
"""
from typing import Optional

from openai import OpenAI

from app.services.proxy_config_manager import ProxyConfigManager
from app.utils.logger import get_logger

logger = get_logger(__name__)


def build_openai_client(
    api_key: Optional[str],
    base_url: Optional[str],
    *,
    key_label: str = "API Key",
    timeout: Optional[float] = None,
) -> OpenAI:
    """构造 OpenAI 客户端。api_key 为空直接抛清晰错误；代理已配置则注入。

    key_label 用于错误提示，例如 "Groq 的 API Key" / "OpenAI 供应商的 API Key"。
    """
    if not api_key or not str(api_key).strip():
        raise ValueError(f"{key_label} 未配置，请先在「设置」里填写后再使用")

    kwargs = {"api_key": str(api_key).strip(), "base_url": base_url}
    if timeout is not None:
        kwargs["timeout"] = timeout

    # 始终显式传入 httpx.Client(trust_env=False)：
    # 本机环境里常见的 NO_PROXY=::1 会触发 httpx 解析异常
    # `Invalid port: ':1'`，导致 OpenAI 客户端还没发请求就失败。
    # 应用代理仍由 ProxyConfigManager 统一读取并显式注入。
    import httpx

    http_client_kwargs = {
        "timeout": timeout or 600.0,
        "trust_env": False,
    }
    proxy_url = ProxyConfigManager().get_proxy_url()
    if proxy_url:
        http_client_kwargs["proxy"] = proxy_url
        logger.info(f"OpenAI 客户端走代理: {proxy_url}")

    kwargs["http_client"] = httpx.Client(**http_client_kwargs)

    return OpenAI(**kwargs)
