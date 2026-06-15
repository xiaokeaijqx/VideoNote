import os
from typing import Optional

from fastapi import Depends, FastAPI, Header, HTTPException


async def verify_web_access_password(
    request_web_access_password: Optional[str] = Header(
        None, alias="request-web-access-password"
    )
):
    expected = os.getenv("WEB_ACCESS_PASSWORD")
    if expected and request_web_access_password != expected:
        raise HTTPException(status_code=401, detail="访问密码错误或未填写")
    return True

def create_app(lifespan) -> FastAPI:
    from .routers import note, notification, provider, model, config, chat, flashcard, hot_videos, article, trend_subscription, feishu
    from .utils.response import ResponseWrapper as R

    app = FastAPI(title="VideoMemo",lifespan=lifespan)
    protected = [Depends(verify_web_access_password)]

    @app.get("/sys_check")
    async def root_sys_check():
        return R.success()

    app.include_router(note.router, prefix="/api", dependencies=protected)
    app.include_router(provider.router, prefix="/api", dependencies=protected)
    app.include_router(model.router, prefix="/api", dependencies=protected)
    app.include_router(config.router, prefix="/api", dependencies=protected)
    app.include_router(chat.router, prefix="/api", dependencies=protected)
    app.include_router(flashcard.router, prefix="/api", dependencies=protected)
    app.include_router(hot_videos.router, prefix="/api", dependencies=protected)
    app.include_router(article.router, prefix="/api", dependencies=protected)
    app.include_router(trend_subscription.router, prefix="/api", dependencies=protected)
    app.include_router(notification.router, prefix="/api", dependencies=protected)
    app.include_router(feishu.router, prefix="/api", dependencies=protected)

    return app
