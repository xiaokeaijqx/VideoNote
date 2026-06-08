from __future__ import annotations

import hashlib
import json
from datetime import datetime

from app.article_fetchers.base import ArticleContent
from app.db.engine import get_db
from app.db.models.articles import ArticleItem, ArticleSubscription, ArticleSubscriptionItem


def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()


def _detach(obj):
    data = {key: value for key, value in obj.__dict__.items() if not key.startswith("_")}
    obj.__dict__.clear()
    obj.__dict__.update(data)
    return obj


def upsert_article_item(article: ArticleContent) -> ArticleItem:
    db = next(get_db())
    try:
        digest = url_hash(article.url)
        item = None
        if article.article_id:
            item = (
                db.query(ArticleItem)
                .filter_by(platform=article.platform, article_id=article.article_id)
                .first()
            )
        if item is None:
            item = db.query(ArticleItem).filter_by(platform=article.platform, url_hash=digest).first()
        if item is None:
            item = ArticleItem(
                platform=article.platform,
                article_id=article.article_id,
                url_hash=digest,
                url=article.url,
                title=article.title,
            )
            db.add(item)
        item.url = article.url
        item.title = article.title
        item.author_name = article.author_name
        item.author_id = article.author_id
        item.cover_url = article.cover_url
        item.published_at = article.published_at
        item.raw_metadata = json.dumps(article.raw_metadata or {}, ensure_ascii=False)
        db.commit()
        db.refresh(item)
        return _detach(item)
    finally:
        db.close()


def get_article_item(item_id: int) -> ArticleItem | None:
    db = next(get_db())
    try:
        item = db.query(ArticleItem).filter_by(id=item_id).first()
        return _detach(item) if item else None
    finally:
        db.close()


def list_article_items(subscription_id: int | None = None) -> list[ArticleItem]:
    db = next(get_db())
    try:
        query = db.query(ArticleItem)
        if subscription_id is not None:
            query = query.join(
                ArticleSubscriptionItem,
                ArticleSubscriptionItem.article_item_id == ArticleItem.id,
            ).filter(ArticleSubscriptionItem.subscription_id == subscription_id)
        return [_detach(item) for item in query.order_by(ArticleItem.id.desc()).all()]
    finally:
        db.close()


def mark_article_summarized(item_id: int, task_id: str) -> None:
    db = next(get_db())
    try:
        item = db.query(ArticleItem).filter_by(id=item_id).first()
        if item:
            item.summary_status = "summarized"
            item.task_id = task_id
            db.commit()
    finally:
        db.close()


def create_subscription(
    platform: str,
    subscription_type: str,
    query: str,
    label: str = "",
) -> ArticleSubscription:
    db = next(get_db())
    try:
        subscription = ArticleSubscription(
            platform=platform,
            type=subscription_type,
            query=query,
            label=label or query,
        )
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        return _detach(subscription)
    finally:
        db.close()


def list_subscriptions() -> list[ArticleSubscription]:
    db = next(get_db())
    try:
        return [
            _detach(item)
            for item in db.query(ArticleSubscription).order_by(ArticleSubscription.id.desc()).all()
        ]
    finally:
        db.close()


def get_subscription(subscription_id: int) -> ArticleSubscription | None:
    db = next(get_db())
    try:
        item = db.query(ArticleSubscription).filter_by(id=subscription_id).first()
        return _detach(item) if item else None
    finally:
        db.close()


def update_subscription_refresh(subscription_id: int, error: str = "") -> None:
    db = next(get_db())
    try:
        item = db.query(ArticleSubscription).filter_by(id=subscription_id).first()
        if item:
            item.last_refresh_at = datetime.now()
            item.last_error = error
            db.commit()
    finally:
        db.close()


def link_subscription_item(subscription_id: int, article_item_id: int, match_reason: str) -> None:
    db = next(get_db())
    try:
        existing = (
            db.query(ArticleSubscriptionItem)
            .filter_by(subscription_id=subscription_id, article_item_id=article_item_id)
            .first()
        )
        if existing is None:
            db.add(
                ArticleSubscriptionItem(
                    subscription_id=subscription_id,
                    article_item_id=article_item_id,
                    match_reason=match_reason,
                )
            )
            db.commit()
    finally:
        db.close()
