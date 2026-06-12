from __future__ import annotations

import json
import re
from typing import Any

from app.db.trend_subscription_dao import (
    count_unread_matches,
    create_match,
    create_subscription,
    delete_subscription,
    get_subscription,
    list_matches,
    list_subscriptions,
    mark_matches_read,
    update_subscription,
    update_subscription_refresh,
)
from app.services.hot_videos import HotVideoItem, fetch_hot_videos


def _parse_keywords(raw: Any) -> list[str]:
    """Parse keywords from stored JSON or list."""
    if isinstance(raw, list):
        return [str(k).strip() for k in raw if str(k).strip()]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return _parse_keywords(parsed)
        except (json.JSONDecodeError, TypeError):
            return [k.strip() for k in raw.split(",") if k.strip()]
    return []


def _parse_platforms(raw: Any) -> list[str]:
    """Parse platform list from stored JSON or string."""
    if isinstance(raw, list):
        return [str(p).strip() for p in raw if str(p).strip()]
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return _parse_platforms(parsed)
        except (json.JSONDecodeError, TypeError):
            return [p.strip() for p in raw.split(",") if p.strip()]
    return ["all"]


def _match_keywords(title: str, keywords: list[str], mode: str = "any") -> tuple[bool, list[str]]:
    """Match title against keywords. Returns (matched, [matched_keyword_strings]).

    Keyword syntax (inspired by TrendRadar):
    - Plain keyword: case-insensitive substring match
    - +keyword: must-have (required)
    - -keyword: exclude (if matched, the item is rejected entirely)
    - /pattern/: regex match
    """
    if not keywords:
        # Empty keywords = match all items (subscribe to entire platform)
        return True, ["*"]

    title_lower = title.lower()
    must_haves: list[str] = []
    excludes: list[str] = []
    normal: list[str] = []

    for kw in keywords:
        kw = kw.strip()
        if not kw:
            continue
        if kw.startswith("+"):
            must_haves.append(kw[1:])
        elif kw.startswith("-"):
            excludes.append(kw[1:])
        else:
            normal.append(kw)

    # Check excludes first — if any exclude matches, reject immediately
    for ex in excludes:
        ex_lower = ex.lower()
        if ex_lower in title_lower:
            return False, []

    all_keywords = must_haves + normal
    if not all_keywords:
        return False, []

    matched: list[str] = []
    for kw in all_keywords:
        kw_lower = kw.lower()
        # Try regex if wrapped in /slashes/
        if kw.startswith("/") and kw.endswith("/") and len(kw) > 2:
            try:
                if re.search(kw[1:-1], title, re.IGNORECASE):
                    matched.append(kw)
            except re.error:
                pass
        elif kw_lower in title_lower:
            matched.append(kw)

    if mode == "all":
        return len(matched) == len(all_keywords), matched
    # mode == "any"
    return len(matched) > 0, matched


class TrendSubscriptionService:
    """Service for managing trend keyword subscriptions and matching hot items."""

    # ─── Subscription CRUD ───────────────────────────────────────────────────────

    def list_subscriptions(self) -> list[dict]:
        subs = list_subscriptions()
        result: list[dict] = []
        for sub in subs:
            d = self._sub_to_dict(sub)
            d["unread_count"] = count_unread_matches(sub.id)
            result.append(d)
        return result

    def get_subscription(self, subscription_id: int) -> dict | None:
        sub = get_subscription(subscription_id)
        if sub is None:
            return None
        d = self._sub_to_dict(sub)
        d["unread_count"] = count_unread_matches(sub.id)
        return d

    def create_subscription(
        self,
        name: str,
        keywords: list[str],
        platforms: list[str] | None = None,
        match_mode: str = "any",
        push_enabled: bool = False,
        push_channel_ids: list[int] | None = None,
    ) -> dict:
        sub = create_subscription(
            name=name,
            keywords=keywords,
            platforms=platforms,
            match_mode=match_mode,
            push_enabled=push_enabled,
            push_channel_ids=push_channel_ids,
        )
        return self._sub_to_dict(sub)

    def update_subscription(
        self,
        subscription_id: int,
        name: str | None = None,
        keywords: list[str] | None = None,
        platforms: list[str] | None = None,
        match_mode: str | None = None,
        enabled: bool | None = None,
        push_enabled: bool | None = None,
        push_channel_ids: list[int] | None = None,
    ) -> dict | None:
        sub = update_subscription(
            subscription_id=subscription_id,
            name=name,
            keywords=keywords,
            platforms=platforms,
            match_mode=match_mode,
            enabled=enabled,
            push_enabled=push_enabled,
            push_channel_ids=push_channel_ids,
        )
        return self._sub_to_dict(sub) if sub else None

    def delete_subscription(self, subscription_id: int) -> bool:
        return delete_subscription(subscription_id)

    # ─── Matching ────────────────────────────────────────────────────────────────

    def match_subscription(self, subscription_id: int) -> dict:
        """Fetch hot items and match against this subscription. Returns summary."""
        sub = get_subscription(subscription_id)
        if sub is None:
            raise ValueError(f"Subscription {subscription_id} not found")

        keywords = _parse_keywords(sub.keywords)
        platforms = _parse_platforms(sub.platforms)
        match_mode = sub.match_mode or "any"

        new_matches: list[dict] = []
        # Fetch from each platform
        for platform in platforms:
            try:
                results = fetch_hot_videos(platform=platform, limit=20)
            except Exception:
                continue

            for result in results:
                if result.status != "ok":
                    continue
                for item in result.items:
                    matched, matched_kws = _match_keywords(item.title, keywords, match_mode)
                    if matched:
                        match = create_match(
                            subscription_id=subscription_id,
                            platform=item.platform,
                            item_id=item.id,
                            title=item.title,
                            url=item.url,
                            hot_score=item.hot_score,
                            matched_keywords=matched_kws,
                        )
                        if match is not None:
                            new_matches.append(self._match_to_dict(match))

        update_subscription_refresh(subscription_id)
        return {
            "subscription_id": subscription_id,
            "new_matches": len(new_matches),
            "matches": new_matches,
        }

    def match_all_subscriptions(self) -> dict:
        """Match all enabled subscriptions. Returns summary for notifications."""
        subs = list_subscriptions()
        summary: dict[str, Any] = {"total_subscriptions": 0, "total_new_matches": 0, "by_subscription": []}

        for sub in subs:
            if not sub.enabled:
                continue
            summary["total_subscriptions"] += 1
            try:
                result = self.match_subscription(sub.id)
                if result["new_matches"] > 0:
                    summary["by_subscription"].append(result)
                    summary["total_new_matches"] += result["new_matches"]
            except Exception:
                continue

        return summary

    # ─── Matches ─────────────────────────────────────────────────────────────────

    def list_matches(
        self,
        subscription_id: int | None = None,
        limit: int = 100,
        unread_only: bool = False,
    ) -> list[dict]:
        matches = list_matches(subscription_id=subscription_id, limit=limit, unread_only=unread_only)
        return [self._match_to_dict(m) for m in matches]

    def mark_all_read(self, subscription_id: int) -> int:
        return mark_matches_read(subscription_id)

    # ─── Helpers ─────────────────────────────────────────────────────────────────

    @staticmethod
    def _sub_to_dict(sub) -> dict:
        return {
            "id": sub.id,
            "name": sub.name,
            "keywords": _parse_keywords(sub.keywords),
            "platforms": _parse_platforms(sub.platforms),
            "match_mode": sub.match_mode,
            "enabled": sub.enabled,
            "push_enabled": sub.push_enabled,
            "push_channel_ids": json.loads(sub.push_channel_ids or "[]"),
            "last_matched_at": sub.last_matched_at.isoformat() if sub.last_matched_at else None,
            "created_at": sub.created_at.isoformat() if sub.created_at else None,
            "updated_at": sub.updated_at.isoformat() if sub.updated_at else None,
        }

    @staticmethod
    def _match_to_dict(m) -> dict:
        return {
            "id": m.id,
            "subscription_id": m.subscription_id,
            "platform": m.platform,
            "item_id": m.item_id,
            "title": m.title,
            "url": m.url,
            "hot_score": m.hot_score,
            "matched_keywords": json.loads(m.matched_keywords or "[]"),
            "matched_at": m.matched_at.isoformat() if m.matched_at else None,
            "is_read": m.is_read,
        }
