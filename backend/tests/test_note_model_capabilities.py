import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import note as note_service
from app.services.note import NoteGenerator


def test_model_supports_multimodal_accepts_string_provider_id(monkeypatch):
    seen = {}

    def fake_get_model_by_provider_and_name(provider_id, model_name):
        seen["provider_id"] = provider_id
        seen["model_name"] = model_name
        return {"supports_multimodal": True}

    monkeypatch.setattr(
        note_service,
        "get_model_by_provider_and_name",
        fake_get_model_by_provider_and_name,
    )

    assert NoteGenerator._model_supports_multimodal("309e8413-829a-497f-9ecc-b0af25b47d8b", "MiniMax-M3")
    assert seen == {
        "provider_id": "309e8413-829a-497f-9ecc-b0af25b47d8b",
        "model_name": "MiniMax-M3",
    }
