from fastapi import APIRouter, Query

from app.services.hot_videos import fetch_hot_video_payload
from app.utils.response import ResponseWrapper as R

router = APIRouter()


@router.get("/hot_videos")
def get_hot_videos(
    platform: str = Query("all"),
    limit: int = Query(12, ge=1, le=30),
    force: bool = Query(False),
):
    try:
        return R.success(fetch_hot_video_payload(platform=platform, limit=limit, force=force))
    except ValueError as exc:
        return R.error(msg=str(exc), code=400)
    except Exception as exc:
        return R.error(msg=f"热点视频获取失败: {exc}")
