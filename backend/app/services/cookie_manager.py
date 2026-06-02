import json
from pathlib import Path
from typing import Optional, Dict


class CookieConfigManager:
    def __init__(self, filepath: str = "config/downloader.json"):
        self.path = Path(filepath)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self._write({})

    def _read(self) -> Dict[str, Dict[str, str]]:
        try:
            with self.path.open("r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def _write(self, data: Dict[str, Dict[str, str]]):
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

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