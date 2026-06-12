from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.db.trend_subscription_dao import (
    create_channel,
    delete_channel,
    get_channel,
    list_channels,
    update_channel,
)
from app.services.notification import NotificationService
from app.utils.response import ResponseWrapper as R

router = APIRouter()


class CreateChannelRequest(BaseModel):
    name: str
    type: str  # "webhook" | "bark" | "email"
    config: dict  # type-specific


class UpdateChannelRequest(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    config: Optional[dict] = None
    enabled: Optional[bool] = None


def _channel_to_dict(ch) -> dict:
    import json

    return {
        "id": ch.id,
        "name": ch.name,
        "type": ch.type,
        "config": json.loads(ch.config or "{}"),
        "enabled": ch.enabled,
        "created_at": ch.created_at.isoformat() if ch.created_at else None,
        "updated_at": ch.updated_at.isoformat() if ch.updated_at else None,
    }


@router.get("/notification_channels")
def get_channels():
    channels = list_channels()
    return R.success([_channel_to_dict(c) for c in channels])


@router.get("/notification_channels/{channel_id}")
def get_channel_detail(channel_id: int):
    channel = get_channel(channel_id)
    if channel is None:
        return R.error(msg=f"通知通道 {channel_id} 不存在", code=404)
    return R.success(_channel_to_dict(channel))


@router.post("/notification_channels")
def create_notification_channel(data: CreateChannelRequest):
    channel = create_channel(name=data.name, channel_type=data.type, config=data.config)
    return R.success(_channel_to_dict(channel))


@router.put("/notification_channels/{channel_id}")
def update_notification_channel(channel_id: int, data: UpdateChannelRequest):
    channel = update_channel(
        channel_id=channel_id,
        name=data.name,
        channel_type=data.type,
        config=data.config,
        enabled=data.enabled,
    )
    if channel is None:
        return R.error(msg=f"通知通道 {channel_id} 不存在", code=404)
    return R.success(_channel_to_dict(channel))


@router.delete("/notification_channels/{channel_id}")
def delete_notification_channel(channel_id: int):
    ok = delete_channel(channel_id)
    if not ok:
        return R.error(msg=f"通知通道 {channel_id} 不存在", code=404)
    return R.success(msg="已删除")


@router.post("/notification_channels/{channel_id}/test")
def test_notification_channel(channel_id: int):
    result = NotificationService().send_test(channel_id)
    if result.get("success"):
        return R.success(result, msg="测试通知发送成功")
    return R.error(msg=result.get("error", "发送失败"), code=400)
