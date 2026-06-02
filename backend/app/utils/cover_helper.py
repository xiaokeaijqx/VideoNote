"""封面图本地化工具。

为什么需要：
- B 站封面是 ``http://`` 直链，桌面端（Tauri WebView 的安全上下文）会按
  mixed content 直接拦截，左侧列表/阅读区 banner 只剩渐变兜底；
- 抖音 / 快手封面是带签名的限时 CDN URL，过期后 404，代理也救不回来。

所以在笔记生成阶段就把封面下载到 ``/static/covers/`` 本地缓存，
结果 JSON 里存稳定的相对路径，前端到哪个端（web / 桌面 / 扩展）都能渲染。
"""
import hashlib
import os
from urllib.parse import urlparse

import requests

from app.utils.path_helper import get_runtime_dir
from app.utils.logger import get_logger

logger = get_logger(__name__)

DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

# Content-Type → 扩展名；遇到不认识的类型统一按 jpg 存
_EXT_BY_TYPE = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/avif": ".avif",
}


def pick_referer(image_url: str) -> str:
    """根据图片 URL 的 host 选择合适的 Referer。

    各平台（B 站 / YouTube / 抖音 / 小红书）的 CDN 都做了 Referer 校验：
    用错了 Referer 会被 403。
    """
    try:
        host = (urlparse(image_url).hostname or "").lower()
    except Exception:
        return ""

    if any(s in host for s in ("bilibili", "hdslb", "biliimg")):
        return "https://www.bilibili.com/"
    if any(s in host for s in ("youtube", "ytimg", "ggpht", "googlevideo")):
        return "https://www.youtube.com/"
    if any(s in host for s in ("xiaohongshu", "xhscdn", "xhslink")):
        return "https://www.xiaohongshu.com/"
    if any(s in host for s in ("douyin", "douyinpic", "douyinvod", "iesdouyin", "amemv")):
        return "https://www.douyin.com/"
    if "kuaishou" in host or "yximgs" in host:
        return "https://www.kuaishou.com/"
    # 其它平台不发 Referer，让服务器决定。
    return ""


def _covers_dir() -> str:
    path = os.path.join(get_runtime_dir("static"), "covers")
    os.makedirs(path, exist_ok=True)
    return path


def localize_cover(cover_url: str, platform: str = "") -> str | None:
    """把远程封面下载到 ``static/covers/``，返回 ``/static/covers/xxx`` 相对路径。

    幂等：同一 URL 落到同一文件名（URL md5），已存在直接复用。
    任何失败都返回 None，调用方保留原始 URL，不影响笔记生成主流程。
    """
    if not cover_url or not str(cover_url).startswith(("http://", "https://")):
        return None

    digest = hashlib.md5(cover_url.encode("utf-8")).hexdigest()[:20]
    covers_dir = _covers_dir()

    # 已缓存过（任意扩展名）直接复用
    for ext in set(_EXT_BY_TYPE.values()):
        cached = os.path.join(covers_dir, f"{digest}{ext}")
        if os.path.exists(cached):
            return f"/static/covers/{digest}{ext}"

    headers = {"User-Agent": DEFAULT_UA}
    referer = pick_referer(cover_url)
    if referer:
        headers["Referer"] = referer

    try:
        resp = requests.get(cover_url, headers=headers, timeout=10)
        resp.raise_for_status()
        content_type = (resp.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type and not content_type.startswith("image/"):
            logger.warning(f"封面本地化跳过：返回的不是图片 Content-Type={content_type} url={cover_url}")
            return None
        ext = _EXT_BY_TYPE.get(content_type, ".jpg")
        filename = f"{digest}{ext}"
        with open(os.path.join(covers_dir, filename), "wb") as f:
            f.write(resp.content)
        logger.info(f"封面已本地化: {cover_url} -> /static/covers/{filename}")
        return f"/static/covers/{filename}"
    except Exception as e:
        logger.warning(f"封面本地化失败（保留原始 URL）: {e} url={cover_url}")
        return None
