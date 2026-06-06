from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import create_app


@asynccontextmanager
async def noop_lifespan(app: FastAPI):
    yield


def test_sys_check_available_at_root_for_frontend_probe():
    app = create_app(lifespan=noop_lifespan)
    client = TestClient(app)

    response = client.get("/sys_check")

    assert response.status_code == 200
    assert response.json()["code"] == 0


def test_sys_check_still_available_under_api_prefix():
    app = create_app(lifespan=noop_lifespan)
    client = TestClient(app)

    response = client.get("/api/sys_check")

    assert response.status_code == 200
    assert response.json()["code"] == 0
