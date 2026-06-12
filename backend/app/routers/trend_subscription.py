from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query
from pydantic import BaseModel

from app.services.trend_subscription import TrendSubscriptionService
from app.utils.response import ResponseWrapper as R

router = APIRouter()


class CreateSubscriptionRequest(BaseModel):
    name: str
    keywords: list[str]
    platforms: Optional[list[str]] = None
    match_mode: str = "any"
    push_enabled: bool = False
    push_channel_ids: Optional[list[int]] = None


class UpdateSubscriptionRequest(BaseModel):
    name: Optional[str] = None
    keywords: Optional[list[str]] = None
    platforms: Optional[list[str]] = None
    match_mode: Optional[str] = None
    enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    push_channel_ids: Optional[list[int]] = None


# ─── Collection-level routes (no path param) MUST come before parameterized routes ──

@router.get("/trend_subscriptions")
def get_trend_subscriptions():
    return R.success(TrendSubscriptionService().list_subscriptions())


@router.post("/trend_subscriptions")
def create_trend_subscription(data: CreateSubscriptionRequest):
    return R.success(
        TrendSubscriptionService().create_subscription(
            name=data.name,
            keywords=data.keywords,
            platforms=data.platforms,
            match_mode=data.match_mode,
            push_enabled=data.push_enabled,
            push_channel_ids=data.push_channel_ids,
        )
    )


@router.post("/trend_subscriptions/match_all")
def match_all_subscriptions():
    from app.services.scheduler import get_scheduler

    summary = get_scheduler().run_now()
    return R.success(summary)


@router.get("/trend_matches")
def get_all_matches(
    limit: int = Query(100, ge=1, le=500),
    unread_only: bool = Query(False),
):
    return R.success(
        TrendSubscriptionService().list_matches(subscription_id=None, limit=limit, unread_only=unread_only)
    )


# ─── Parameterized routes (with {subscription_id}) ───────────────────────────────

@router.get("/trend_subscriptions/{subscription_id}")
def get_trend_subscription(subscription_id: int):
    result = TrendSubscriptionService().get_subscription(subscription_id)
    if result is None:
        return R.error(msg=f"订阅 {subscription_id} 不存在", code=404)
    return R.success(result)


@router.put("/trend_subscriptions/{subscription_id}")
def update_trend_subscription(subscription_id: int, data: UpdateSubscriptionRequest):
    result = TrendSubscriptionService().update_subscription(
        subscription_id=subscription_id,
        name=data.name,
        keywords=data.keywords,
        platforms=data.platforms,
        match_mode=data.match_mode,
        enabled=data.enabled,
        push_enabled=data.push_enabled,
        push_channel_ids=data.push_channel_ids,
    )
    if result is None:
        return R.error(msg=f"订阅 {subscription_id} 不存在", code=404)
    return R.success(result)


@router.delete("/trend_subscriptions/{subscription_id}")
def delete_trend_subscription(subscription_id: int):
    ok = TrendSubscriptionService().delete_subscription(subscription_id)
    if not ok:
        return R.error(msg=f"订阅 {subscription_id} 不存在", code=404)
    return R.success(msg="已删除")


@router.post("/trend_subscriptions/{subscription_id}/match")
def match_trend_subscription(subscription_id: int):
    try:
        result = TrendSubscriptionService().match_subscription(subscription_id)
        # Also send push notifications if enabled and new matches found
        if result["new_matches"] > 0:
            try:
                from app.services.notification import NotificationService
                sub = TrendSubscriptionService().get_subscription(subscription_id)
                if sub and sub.get("push_enabled") and sub.get("push_channel_ids"):
                    match_titles = [m["title"] for m in result["matches"]]
                    title = f"🔥 VideoMemo: {sub['name']} — {len(match_titles)} 条新热点"
                    body = "\n\n".join(f"• {t}" for t in match_titles[:10])
                    if len(match_titles) > 10:
                        body += f"\n\n…共 {len(match_titles)} 条"
                    NotificationService().send_batch(sub["push_channel_ids"], title, body)
                    result["push_sent"] = True
            except Exception:
                result["push_sent"] = False
        return R.success(result)
    except ValueError as exc:
        return R.error(msg=str(exc), code=404)


@router.get("/trend_subscriptions/{subscription_id}/matches")
def get_subscription_matches(
    subscription_id: int,
    limit: int = Query(100, ge=1, le=500),
    unread_only: bool = Query(False),
):
    return R.success(
        TrendSubscriptionService().list_matches(
            subscription_id=subscription_id,
            limit=limit,
            unread_only=unread_only,
        )
    )


@router.post("/trend_subscriptions/{subscription_id}/matches/read-all")
def mark_subscription_matches_read(subscription_id: int):
    count = TrendSubscriptionService().mark_all_read(subscription_id)
    return R.success({"marked_read": count})
