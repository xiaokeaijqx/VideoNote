import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.browser_cookie import BrowserCookieError, sync_browser_cookie
from app.services.cookie_manager import CookieConfigManager


def test_sync_browser_cookie_filters_platform_domain_and_persists(tmp_path, monkeypatch):
    manager = CookieConfigManager(filepath=str(tmp_path / "downloader.json"))

    def fake_extract(browser):
        assert browser == "chrome"
        return [
            SimpleNamespace(domain=".youtube.com", name="SID", value="abc"),
            SimpleNamespace(domain="www.youtube.com", name="HSID", value="def"),
            SimpleNamespace(domain=".douyin.com", name="sessionid", value="skip"),
            SimpleNamespace(domain=".youtube.com", name="empty", value=""),
        ]

    monkeypatch.setattr("app.services.browser_cookie._extract_cookies_from_browser", fake_extract)

    result = sync_browser_cookie("youtube", "chrome", manager=manager)

    assert result == {
        "platform": "youtube",
        "browser": "chrome",
        "cookie": "SID=abc; HSID=def",
        "count": 2,
    }
    assert manager.get("youtube") == "SID=abc; HSID=def"
    assert manager.get_browser("youtube") == "chrome"


def test_sync_browser_cookie_raises_when_browser_has_no_platform_cookie(tmp_path, monkeypatch):
    manager = CookieConfigManager(filepath=str(tmp_path / "downloader.json"))

    monkeypatch.setattr(
        "app.services.browser_cookie._extract_cookies_from_browser",
        lambda browser: [SimpleNamespace(domain=".example.com", name="SID", value="abc")],
    )

    try:
        sync_browser_cookie("bilibili", "safari", manager=manager)
    except BrowserCookieError as exc:
        assert "未找到 bilibili 对应的浏览器 Cookie" in str(exc)
    else:
        raise AssertionError("Expected BrowserCookieError")
