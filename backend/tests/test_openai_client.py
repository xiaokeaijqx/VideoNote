import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.proxy_config_manager import ProxyConfigManager
from app.utils.openai_client import build_openai_client


def test_build_openai_client_ignores_invalid_no_proxy_env(monkeypatch):
    monkeypatch.setenv(
        "NO_PROXY",
        "127.0.0.1,localhost,::1,127.0.0.0/8,::1/128",
    )
    monkeypatch.setenv(
        "no_proxy",
        "127.0.0.1,localhost,::1,127.0.0.0/8,::1/128",
    )
    for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(ProxyConfigManager, "get_proxy_url", lambda self: None)

    client = build_openai_client("sk-test", "https://api.deepseek.com")

    assert str(client.base_url).rstrip("/") == "https://api.deepseek.com"
