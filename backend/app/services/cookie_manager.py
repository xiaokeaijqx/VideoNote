from typing import Optional, Dict

from app.db.app_config_dao import load_value, set_value


class CookieConfigManager:
    # 平台 cookie 持久化在数据库 app_config 表（key="downloader"）；
    # filepath 仅用于把旧的 config/downloader.json 一次性导入。
    _KEY = "downloader"

    def __init__(self, filepath: str = "config/downloader.json"):
        self._legacy_path = filepath

    def _read(self) -> Dict[str, Dict[str, str]]:
        return load_value(self._KEY, self._legacy_path, {}) or {}

    def _write(self, data: Dict[str, Dict[str, str]]):
        set_value(self._KEY, data)

    def get(self, platform: str) -> Optional[str]:
        data = self._read()
        return data.get(platform, {}).get("cookie")

    def get_browser(self, platform: str) -> Optional[str]:
        """读取该平台配置的「从浏览器读 cookie」选项，未配置返回 None。"""
        data = self._read()
        browser = data.get(platform, {}).get("browser")
        return browser or None

    def set(self, platform: str, cookie: str, browser: Optional[str] = None):
        """保存平台的 cookie 字符串及可选的浏览器名。

        browser 传 None 表示不修改原浏览器设置；传空字符串则清除浏览器设置。
        """
        data = self._read()
        entry = data.get(platform, {}) or {}
        entry["cookie"] = cookie
        if browser is not None:
            if browser:
                entry["browser"] = browser
            else:
                entry.pop("browser", None)
        data[platform] = entry
        self._write(data)

    def delete(self, platform: str):
        data = self._read()
        if platform in data:
            del data[platform]
            self._write(data)

    def list_all(self) -> Dict[str, str]:
        data = self._read()
        return {k: v.get("cookie", "") for k, v in data.items()}

    def exists(self, platform: str) -> bool:
        return self.get(platform) is not None