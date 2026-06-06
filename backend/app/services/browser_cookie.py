import subprocess
import sys
import webbrowser
from typing import Optional

from app.services.cookie_manager import CookieConfigManager


PLATFORM_COOKIE_DOMAINS = {
    "bilibili": ("bilibili.com",),
    "youtube": ("youtube.com", "youtu.be"),
    "douyin": ("douyin.com", "iesdouyin.com"),
    "kuaishou": ("kuaishou.com",),
    "xiaohongshu": ("xiaohongshu.com", "xhslink.com"),
}

PLATFORM_LOGIN_URLS = {
    "bilibili": "https://www.bilibili.com/",
    "youtube": "https://www.youtube.com/",
    "douyin": "https://www.douyin.com/",
    "kuaishou": "https://www.kuaishou.com/",
    "xiaohongshu": "https://www.xiaohongshu.com/",
}

PLATFORM_LABELS = {
    "bilibili": "B站",
    "youtube": "YouTube",
    "douyin": "抖音",
    "kuaishou": "快手",
    "xiaohongshu": "小红书",
}


class BrowserCookieError(Exception):
    pass


def _extract_cookies_from_browser(browser: str):
    try:
        from yt_dlp.cookies import extract_cookies_from_browser
    except Exception as exc:
        raise BrowserCookieError("当前后端环境缺少 yt-dlp，无法从浏览器读取 Cookie") from exc
    return extract_cookies_from_browser(browser)


def _cookie_domains_for_platform(platform: str) -> tuple[str, ...]:
    return PLATFORM_COOKIE_DOMAINS.get(platform, (platform,))


def _matches_platform_domain(cookie_domain: str, platform: str) -> bool:
    domain = (cookie_domain or "").lstrip(".").lower()
    return any(
        domain == target or domain.endswith(f".{target}")
        for target in _cookie_domains_for_platform(platform)
    )


def _format_cookie_pairs(cookies, platform: str) -> list[str]:
    pairs = []
    seen = set()
    for cookie in cookies:
        name = getattr(cookie, "name", "")
        value = getattr(cookie, "value", "")
        domain = getattr(cookie, "domain", "")
        if not name or not value or not _matches_platform_domain(domain, platform):
            continue
        key = (name, value)
        if key in seen:
            continue
        seen.add(key)
        pairs.append(f"{name}={value}")
    return pairs


def _open_url_in_browser(url: str, browser: str) -> bool:
    browser = (browser or "").strip().lower()
    if sys.platform == "darwin" and browser:
        mac_apps = {
            "chrome": "Google Chrome",
            "edge": "Microsoft Edge",
            "firefox": "Firefox",
            "safari": "Safari",
            "brave": "Brave Browser",
            "chromium": "Chromium",
            "opera": "Opera",
            "vivaldi": "Vivaldi",
        }
        app_name = mac_apps.get(browser)
        if app_name:
            try:
                subprocess.Popen(["open", "-a", app_name, url])
                return True
            except Exception:
                pass
    return webbrowser.open_new_tab(url)


def sync_browser_cookie(
    platform: str,
    browser: str,
    manager: Optional[CookieConfigManager] = None,
) -> dict:
    platform = (platform or "").strip()
    browser = (browser or "").strip()
    if not platform:
        raise BrowserCookieError("平台不能为空")
    if not browser:
        raise BrowserCookieError("请选择浏览器")

    try:
        cookies = _extract_cookies_from_browser(browser)
    except Exception as exc:
        if isinstance(exc, BrowserCookieError):
            raise
        raise BrowserCookieError(f"从浏览器读取 Cookie 失败：{exc}") from exc

    pairs = _format_cookie_pairs(cookies, platform)
    if not pairs:
        login_url = PLATFORM_LOGIN_URLS.get(platform)
        opened = bool(login_url and _open_url_in_browser(login_url, browser))
        label = PLATFORM_LABELS.get(platform, platform)
        opened_hint = f"已打开{label}页面，登录后再点击一键获取。" if opened else ""
        raise BrowserCookieError(
            f"未找到 {platform} 对应的浏览器 Cookie，请先在该浏览器登录对应平台。{opened_hint}"
        )

    cookie_str = "; ".join(pairs)
    cookie_manager = manager or CookieConfigManager()
    cookie_manager.set(platform, cookie_str, browser=browser)
    return {
        "platform": platform,
        "browser": browser,
        "cookie": cookie_str,
        "count": len(pairs),
    }
