import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import create_app
from app.services.hot_videos import HotVideoItem, PlatformHotVideoResult


@asynccontextmanager
async def noop_lifespan(app: FastAPI):
    yield


def test_hot_videos_route_returns_normalized_payload(monkeypatch):
    from app.routers import hot_videos as route

    def fake_payload(platform="all", limit=12, force=False):
        return {
            "platform": platform,
            "limit": limit,
            "generated_at": "2026-06-08T09:30:00+08:00",
            "platforms": [
                PlatformHotVideoResult(
                    platform="bilibili",
                    status="ok",
                    message="",
                    items=[
                        HotVideoItem(
                            id="BV1route",
                            platform="bilibili",
                            title="路由测试",
                            url="https://www.bilibili.com/video/BV1route",
                            rank=1,
                            source="bilibili_popular",
                        )
                    ],
                ).to_dict()
            ],
        }

    monkeypatch.setattr(route, "fetch_hot_video_payload", fake_payload)
    app = create_app(lifespan=noop_lifespan)
    client = TestClient(app)

    response = client.get("/api/hot_videos?platform=bilibili&limit=3")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 0
    assert body["data"]["platform"] == "bilibili"
    assert body["data"]["limit"] == 3
    assert (
        body["data"]["platforms"][0]["items"][0]["url"]
        == "https://www.bilibili.com/video/BV1route"
    )


def test_hot_videos_route_returns_business_error_for_invalid_platform(monkeypatch):
    from app.routers import hot_videos as route

    def fake_payload(platform="all", limit=12, force=False):
        raise ValueError("不支持的热点平台: instagram")

    monkeypatch.setattr(route, "fetch_hot_video_payload", fake_payload)
    app = create_app(lifespan=noop_lifespan)
    client = TestClient(app)

    response = client.get("/api/hot_videos?platform=instagram")

    assert response.status_code == 200
    body = response.json()
    assert body["code"] == 400
    assert "不支持的热点平台" in body["msg"]
