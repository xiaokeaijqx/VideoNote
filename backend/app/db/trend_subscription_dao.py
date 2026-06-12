from __future__ import annotations

import json
from datetime import datetime

from app.db.engine import get_db
from app.db.models.trend_subscription import (
    NotificationChannel,
    TrendSubscription,
    TrendSubscriptionMatch,
)


def _detach(obj):
    data = {key: value for key, value in obj.__dict__.items() if not key.startswith("_")}
    obj.__dict__.clear()
    obj.__dict__.update(data)
    return obj


# ─── Trend Subscriptions ──────────────────────────────────────────────────────────

def create_subscription(
    name: str,
    keywords: list[str],
    platforms: list[str] | None = None,
    match_mode: str = "any",
    push_enabled: bool = False,
    push_channel_ids: list[int] | None = None,
) -> TrendSubscription:
    db = next(get_db())
    try:
        sub = TrendSubscription(
            name=name,
            keywords=json.dumps(keywords, ensure_ascii=False),
            platforms=json.dumps(platforms or ["all"], ensure_ascii=False),
            match_mode=match_mode,
            push_enabled=push_enabled,
            push_channel_ids=json.dumps(push_channel_ids or []),
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
        return _detach(sub)
    finally:
        db.close()


def list_subscriptions() -> list[TrendSubscription]:
    db = next(get_db())
    try:
        return [
            _detach(item)
            for item in db.query(TrendSubscription).order_by(TrendSubscription.id.desc()).all()
        ]
    finally:
        db.close()


def get_subscription(subscription_id: int) -> TrendSubscription | None:
    db = next(get_db())
    try:
        item = db.query(TrendSubscription).filter_by(id=subscription_id).first()
        return _detach(item) if item else None
    finally:
        db.close()


def update_subscription(
    subscription_id: int,
    name: str | None = None,
    keywords: list[str] | None = None,
    platforms: list[str] | None = None,
    match_mode: str | None = None,
    enabled: bool | None = None,
    push_enabled: bool | None = None,
    push_channel_ids: list[int] | None = None,
) -> TrendSubscription | None:
    db = next(get_db())
    try:
        sub = db.query(TrendSubscription).filter_by(id=subscription_id).first()
        if sub is None:
            return None
        if name is not None:
            sub.name = name
        if keywords is not None:
            sub.keywords = json.dumps(keywords, ensure_ascii=False)
        if platforms is not None:
            sub.platforms = json.dumps(platforms, ensure_ascii=False)
        if match_mode is not None:
            sub.match_mode = match_mode
        if enabled is not None:
            sub.enabled = enabled
        if push_enabled is not None:
            sub.push_enabled = push_enabled
        if push_channel_ids is not None:
            sub.push_channel_ids = json.dumps(push_channel_ids)
        db.commit()
        db.refresh(sub)
        return _detach(sub)
    finally:
        db.close()


def delete_subscription(subscription_id: int) -> bool:
    db = next(get_db())
    try:
        sub = db.query(TrendSubscription).filter_by(id=subscription_id).first()
        if sub is None:
            return False
        # also delete associated matches
        db.query(TrendSubscriptionMatch).filter_by(subscription_id=subscription_id).delete()
        db.delete(sub)
        db.commit()
        return True
    finally:
        db.close()


def update_subscription_refresh(subscription_id: int) -> None:
    db = next(get_db())
    try:
        sub = db.query(TrendSubscription).filter_by(id=subscription_id).first()
        if sub:
            sub.last_matched_at = datetime.now()
            db.commit()
    finally:
        db.close()


# ─── Trend Subscription Matches ───────────────────────────────────────────────────

def create_match(
    subscription_id: int,
    platform: str,
    item_id: str,
    title: str,
    url: str = "",
    hot_score: str = "",
    matched_keywords: list[str] | None = None,
) -> TrendSubscriptionMatch | None:
    """Create a match record. Returns None if this (subscription, platform, item_id) already exists."""
    db = next(get_db())
    try:
        existing = (
            db.query(TrendSubscriptionMatch)
            .filter_by(subscription_id=subscription_id, platform=platform, item_id=item_id)
            .first()
        )
        if existing is not None:
            return None  # already matched before
        match = TrendSubscriptionMatch(
            subscription_id=subscription_id,
            platform=platform,
            item_id=item_id,
            title=title,
            url=url,
            hot_score=hot_score,
            matched_keywords=json.dumps(matched_keywords or [], ensure_ascii=False),
        )
        db.add(match)
        db.commit()
        db.refresh(match)
        return _detach(match)
    finally:
        db.close()


def list_matches(
    subscription_id: int | None = None,
    limit: int = 100,
    unread_only: bool = False,
) -> list[TrendSubscriptionMatch]:
    db = next(get_db())
    try:
        query = db.query(TrendSubscriptionMatch)
        if subscription_id is not None:
            query = query.filter_by(subscription_id=subscription_id)
        if unread_only:
            query = query.filter_by(is_read=False)
        return [
            _detach(item)
            for item in query.order_by(TrendSubscriptionMatch.matched_at.desc())
            .limit(limit)
            .all()
        ]
    finally:
        db.close()


def mark_matches_read(subscription_id: int) -> int:
    """Mark all matches for a subscription as read. Returns count of updated rows."""
    db = next(get_db())
    try:
        count = (
            db.query(TrendSubscriptionMatch)
            .filter_by(subscription_id=subscription_id, is_read=False)
            .update({"is_read": True})
        )
        db.commit()
        return count
    finally:
        db.close()


def count_unread_matches(subscription_id: int) -> int:
    db = next(get_db())
    try:
        return (
            db.query(TrendSubscriptionMatch)
            .filter_by(subscription_id=subscription_id, is_read=False)
            .count()
        )
    finally:
        db.close()


# ─── Notification Channels ────────────────────────────────────────────────────────

def create_channel(name: str, channel_type: str, config: dict | None = None) -> NotificationChannel:
    db = next(get_db())
    try:
        channel = NotificationChannel(
            name=name,
            type=channel_type,
            config=json.dumps(config or {}, ensure_ascii=False),
        )
        db.add(channel)
        db.commit()
        db.refresh(channel)
        return _detach(channel)
    finally:
        db.close()


def list_channels() -> list[NotificationChannel]:
    db = next(get_db())
    try:
        return [
            _detach(item)
            for item in db.query(NotificationChannel).order_by(NotificationChannel.id.desc()).all()
        ]
    finally:
        db.close()


def get_channel(channel_id: int) -> NotificationChannel | None:
    db = next(get_db())
    try:
        item = db.query(NotificationChannel).filter_by(id=channel_id).first()
        return _detach(item) if item else None
    finally:
        db.close()


def update_channel(
    channel_id: int,
    name: str | None = None,
    channel_type: str | None = None,
    config: dict | None = None,
    enabled: bool | None = None,
) -> NotificationChannel | None:
    db = next(get_db())
    try:
        channel = db.query(NotificationChannel).filter_by(id=channel_id).first()
        if channel is None:
            return None
        if name is not None:
            channel.name = name
        if channel_type is not None:
            channel.type = channel_type
        if config is not None:
            channel.config = json.dumps(config, ensure_ascii=False)
        if enabled is not None:
            channel.enabled = enabled
        db.commit()
        db.refresh(channel)
        return _detach(channel)
    finally:
        db.close()


def delete_channel(channel_id: int) -> bool:
    db = next(get_db())
    try:
        channel = db.query(NotificationChannel).filter_by(id=channel_id).first()
        if channel is None:
            return False
        db.delete(channel)
        db.commit()
        return True
    finally:
        db.close()
