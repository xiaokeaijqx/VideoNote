from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import create_app


@asynccontextmanager
async def noop_lifespan(app: FastAPI):
    yield


class FakeService:
    def generate_from_url(self, **kwargs):
        return {"task_id": kwargs.get("task_id") or "task-1", "article_item_id": 1}

    def search(self, platform, keyword, limit=20):
        return {"platform": platform, "keyword": keyword, "status": "ok", "message": "", "items": []}

    def create_subscription(self, platform, subscription_type, query, label=""):
        return {"id": 1, "platform": platform, "type": subscription_type, "query": query, "label": label}

    def list_subscriptions(self):
        return []

    def refresh_subscription(self, subscription_id, limit=20):
        return {"subscription_id": subscription_id, "count": 0, "items": []}

    def list_items(self, subscription_id=None):
        return []

    def summarize_item(self, item_id, **kwargs):
        return {"task_id": "task-1", "article_item_id": item_id}


def app_with_fake_service(monkeypatch):
    from app.routers import article

    monkeypatch.setattr(article, "ArticleService", lambda: FakeService())
    return TestClient(create_app(lifespan=noop_lifespan))


def test_generate_article_route(monkeypatch):
    client = app_with_fake_service(monkeypatch)

    response = client.post(
        "/api/articles/generate",
        json={
            "url": "https://mp.weixin.qq.com/s/a",
            "platform": "wechat_mp",
            "provider_id": "p",
            "model_name": "m",
            "style": "minimal",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["task_id"] == "task-1"


def test_article_search_route(monkeypatch):
    client = app_with_fake_service(monkeypatch)

    response = client.get("/api/articles/search?platform=xiaohongshu&keyword=AI")

    assert response.status_code == 200
    assert response.json()["data"]["keyword"] == "AI"


def test_article_subscription_routes(monkeypatch):
    client = app_with_fake_service(monkeypatch)

    created = client.post(
        "/api/article_subscriptions",
        json={"platform": "wechat_mp", "type": "publisher", "query": "账号", "label": "账号"},
    )
    refreshed = client.post("/api/article_subscriptions/1/refresh")

    assert created.status_code == 200
    assert created.json()["data"]["query"] == "账号"
    assert refreshed.json()["data"]["subscription_id"] == 1
