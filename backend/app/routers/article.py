from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.article_fetchers.base import ArticleFetchError
from app.exceptions.biz_exception import BizException
from app.services.article import ArticleService
from app.utils.response import ResponseWrapper as R

router = APIRouter()


class ArticleGenerateRequest(BaseModel):
    url: str
    platform: str
    provider_id: str
    model_name: str
    style: str = ""
    extras: str = ""
    task_id: Optional[str] = None


class ArticleImportRequest(BaseModel):
    url: str = ""
    platform: str = "generic_web"
    title: str = ""
    content_text: str
    author_name: str = ""
    provider_id: str
    model_name: str
    style: str = ""
    extras: str = ""
    task_id: Optional[str] = None


class SubscriptionRequest(BaseModel):
    platform: str
    type: str
    query: str
    label: str = ""


class SummarizeItemRequest(BaseModel):
    provider_id: str
    model_name: str
    style: str = ""
    extras: str = ""


@router.post("/articles/generate")
def generate_article(data: ArticleGenerateRequest):
    try:
        return R.success(
            ArticleService().generate_from_url(
                url=data.url,
                platform=data.platform,
                provider_id=data.provider_id,
                model_name=data.model_name,
                style=data.style,
                extras=data.extras,
                task_id=data.task_id,
            )
        )
    except (ArticleFetchError, ValueError) as exc:
        raise BizException(400400, str(exc)) from exc


@router.post("/articles/import_content")
def import_article_content(data: ArticleImportRequest):
    try:
        return R.success(
            ArticleService().generate_from_content(
                url=data.url,
                platform=data.platform,
                title=data.title,
                content_text=data.content_text,
                author_name=data.author_name,
                provider_id=data.provider_id,
                model_name=data.model_name,
                style=data.style,
                extras=data.extras,
                task_id=data.task_id,
            )
        )
    except (ArticleFetchError, ValueError) as exc:
        raise BizException(400400, str(exc)) from exc


@router.get("/articles/search")
def search_articles(platform: str, keyword: str, limit: int = 20):
    try:
        return R.success(ArticleService().search(platform=platform, keyword=keyword, limit=limit))
    except (ArticleFetchError, ValueError) as exc:
        raise BizException(400400, str(exc)) from exc


@router.post("/article_subscriptions")
def create_article_subscription(data: SubscriptionRequest):
    return R.success(
        ArticleService().create_subscription(
            platform=data.platform,
            subscription_type=data.type,
            query=data.query,
            label=data.label,
        )
    )


@router.get("/article_subscriptions")
def get_article_subscriptions():
    return R.success(ArticleService().list_subscriptions())


@router.post("/article_subscriptions/{subscription_id}/refresh")
def refresh_article_subscription(subscription_id: int, limit: int = 20):
    try:
        return R.success(ArticleService().refresh_subscription(subscription_id, limit=limit))
    except (ArticleFetchError, ValueError) as exc:
        raise BizException(400400, str(exc)) from exc


@router.get("/article_items")
def get_article_items(subscription_id: Optional[int] = None):
    return R.success(ArticleService().list_items(subscription_id=subscription_id))


@router.get("/article_items/{item_id}")
def get_article_item(item_id: int):
    try:
        return R.success(ArticleService().get_item(item_id))
    except ValueError as exc:
        raise BizException(400404, str(exc)) from exc


@router.post("/article_items/{item_id}/summarize")
def summarize_article_item(item_id: int, data: SummarizeItemRequest):
    try:
        return R.success(
            ArticleService().summarize_item(
                item_id=item_id,
                provider_id=data.provider_id,
                model_name=data.model_name,
                style=data.style,
                extras=data.extras,
            )
        )
    except (ArticleFetchError, ValueError) as exc:
        raise BizException(400400, str(exc)) from exc
