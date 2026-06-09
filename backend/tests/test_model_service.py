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
            {"id": "deepseek-chat", "object": "model", "supports_multimodal": False},
            {"id": "deepseek-reasoner", "object": "model", "supports_multimodal": False},
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

    assert result == {
        "models": [{"id": "gpt-4o-mini", "object": "model", "supports_multimodal": False}]
    }


def test_format_models_defaults_supports_multimodal_false():
    result = ModelService._format_models([
        {"id": 1, "provider_id": 2, "model_name": "deepseek-chat"}
    ])

    assert result[0]["supports_multimodal"] is False


def test_get_all_models_by_id_marks_remote_multimodal_metadata(monkeypatch):
    monkeypatch.setattr(ProviderService, "get_provider_by_id", _provider)
    monkeypatch.setattr(
        ModelService,
        "get_model_list",
        lambda provider_id, verbose=False: [
            {"id": "gpt-4o", "object": "model", "modalities": ["text", "image"]},
            {"id": "deepseek-chat", "object": "model"},
        ],
    )

    result = ModelService.get_all_models_by_id("openai")

    assert result == {
        "models": [
            {
                "id": "gpt-4o",
                "object": "model",
                "modalities": ["text", "image"],
                "supports_multimodal": True,
            },
            {
                "id": "deepseek-chat",
                "object": "model",
                "supports_multimodal": False,
            },
        ]
    }
