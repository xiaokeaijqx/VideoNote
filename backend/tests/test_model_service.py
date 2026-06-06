import sys
from pathlib import Path
from types import SimpleNamespace

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.model import ModelService
from app.services.provider import ProviderService


def _provider(provider_id: str):
    return {
        "id": provider_id,
        "name": "DeepSeek",
        "api_key": "sk-test",
        "base_url": "https://api.deepseek.com",
    }


def test_get_all_models_by_id_accepts_plain_model_list(monkeypatch):
    monkeypatch.setattr(ProviderService, "get_provider_by_id", _provider)
    monkeypatch.setattr(
        ModelService,
        "get_model_list",
        lambda provider_id, verbose=False: [
            {"id": "deepseek-chat", "object": "model"},
            {"id": "deepseek-reasoner", "object": "model"},
        ],
    )

    result = ModelService.get_all_models_by_id("deepseek")

    assert result == {
        "models": [
            {"id": "deepseek-chat", "object": "model"},
            {"id": "deepseek-reasoner", "object": "model"},
        ]
    }


def test_get_all_models_by_id_accepts_openai_page_data(monkeypatch):
    monkeypatch.setattr(ProviderService, "get_provider_by_id", _provider)
    monkeypatch.setattr(
        ModelService,
        "get_model_list",
        lambda provider_id, verbose=False: SimpleNamespace(
            data=[
                SimpleNamespace(model_dump=lambda: {"id": "gpt-4o-mini", "object": "model"}),
            ]
        ),
    )

    result = ModelService.get_all_models_by_id("openai")

    assert result == {"models": [{"id": "gpt-4o-mini", "object": "model"}]}
