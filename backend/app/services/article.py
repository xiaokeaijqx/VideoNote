from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Callable

from app.article_fetchers.base import ArticleContent, ArticleFetcher
from app.article_fetchers.generic import GenericArticleFetcher
from app.article_fetchers.wechat import WechatArticleFetcher
from app.article_fetchers.xiaohongshu import XiaohongshuArticleFetcher
from app.db.note_dao import load_note, save_note, set_status
from app.db.article_dao import (
    create_subscription,
    get_article_item,
    get_subscription,
    link_subscription_item,
    list_article_items,
    list_subscriptions,
    mark_article_summarized,
    update_subscription_refresh,
    upsert_article_item,
)
from app.enmus.task_status_enums import TaskStatus
from app.gpt.gpt_factory import GPTFactory
from app.models.gpt_model import GPTSource
from app.models.model_config import ModelConfig
from app.models.transcriber_model import TranscriptSegment
from app.services.provider import ProviderService


def _note_output_dir() -> Path:
    path = Path(os.getenv("NOTE_OUTPUT_DIR", "note_results"))
    path.mkdir(parents=True, exist_ok=True)
    return path


class ArticleService:
    def __init__(
        self,
        fetchers: dict[str, ArticleFetcher] | None = None,
        gpt_factory: Callable[[str, str], object] | None = None,
    ):
        self.fetchers = fetchers or {
            "wechat_mp": WechatArticleFetcher(),
            "xiaohongshu": XiaohongshuArticleFetcher(),
            "generic_web": GenericArticleFetcher(),
        }
        self.gpt_factory = gpt_factory or self._create_gpt

    def generate_from_url(
        self,
        url: str,
        platform: str,
        provider_id: str,
        model_name: str,
        style: str = "",
        extras: str = "",
        task_id: str | None = None,
    ) -> dict:
        task_id = task_id or str(uuid.uuid4())
        try:
            self._update_status(task_id, TaskStatus.PARSING)
            article = self._fetcher(platform).fetch(url)
            item = upsert_article_item(article)
            self._update_status(task_id, TaskStatus.TRANSCRIBING)

            gpt = self.gpt_factory(model_name, provider_id)
            markdown = gpt.summarize(
                GPTSource(
                    segment=self._segments(article),
                    title=article.title,
                    tags="article",
                    style=style,
                    extras=extras,
                )
            )

            self._update_status(task_id, TaskStatus.SAVING)
            self._write_note_json(
                task_id,
                article,
                markdown,
                int(getattr(gpt, "total_tokens", 0) or 0),
            )
            mark_article_summarized(item.id, task_id)
            self._update_status(task_id, TaskStatus.SUCCESS)
            self._index_task(task_id)
            return {"task_id": task_id, "article_item_id": item.id}
        except Exception:
            self._update_status(task_id, TaskStatus.FAILED)
            raise

    def generate_from_content(
        self,
        url: str,
        platform: str,
        title: str,
        content_text: str,
        provider_id: str,
        model_name: str,
        style: str = "",
        extras: str = "",
        author_name: str = "",
        task_id: str | None = None,
    ) -> dict:
        body = (content_text or "").strip()
        if len(body) < 20:
            raise ValueError("导入正文过短，无法生成总结")
        task_id = task_id or str(uuid.uuid4())
        try:
            self._update_status(task_id, TaskStatus.PARSING)
            article = ArticleContent(
                platform=platform or "generic_web",
                url=url or f"manual://{task_id}",
                article_id=url or task_id,
                title=(title or "").strip() or "导入文章",
                author_name=author_name,
                content_text=body,
                raw_metadata={"source": "manual_import"},
            )
            item = upsert_article_item(article)
            self._update_status(task_id, TaskStatus.TRANSCRIBING)

            gpt = self.gpt_factory(model_name, provider_id)
            markdown = gpt.summarize(
                GPTSource(
                    segment=self._segments(article),
                    title=article.title,
                    tags="article",
                    style=style,
                    extras=extras,
                )
            )

            self._update_status(task_id, TaskStatus.SAVING)
            self._write_note_json(
                task_id,
                article,
                markdown,
                int(getattr(gpt, "total_tokens", 0) or 0),
            )
            mark_article_summarized(item.id, task_id)
            self._update_status(task_id, TaskStatus.SUCCESS)
            self._index_task(task_id)
            return {"task_id": task_id, "article_item_id": item.id}
        except Exception:
            self._update_status(task_id, TaskStatus.FAILED)
            raise

    def fetch_only_from_url(self, url: str, platform: str) -> dict:
        article = self._fetcher(platform).fetch(url)
        item = upsert_article_item(article)
        return self._item_payload(item, include_content=True)

    def import_only_content(
        self,
        url: str,
        platform: str,
        title: str,
        content_text: str,
        author_name: str = "",
    ) -> dict:
        body = (content_text or "").strip()
        if len(body) < 20:
            raise ValueError("导入正文过短")
        article_id = url or str(uuid.uuid4())
        article = ArticleContent(
            platform=platform or "generic_web",
            url=url or f"manual://{article_id}",
            article_id=article_id,
            title=(title or "").strip() or "导入文章",
            author_name=author_name,
            content_text=body,
            raw_metadata={"source": "manual_import"},
        )
        item = upsert_article_item(article)
        return self._item_payload(item, include_content=True)

    def search(self, platform: str, keyword: str, limit: int = 20) -> dict:
        articles = self._fetcher(platform).search(keyword, limit)
        items = [upsert_article_item(article) for article in articles]
        return {
            "platform": platform,
            "keyword": keyword,
            "status": "ok",
            "message": "",
            "items": [self._item_payload(item) for item in items],
        }

    def refresh_subscription(self, subscription_id: int, limit: int = 20) -> dict:
        subscription = get_subscription(subscription_id)
        if not subscription:
            raise ValueError("订阅不存在")

        fetcher = self._fetcher(subscription.platform)
        if subscription.type == "publisher":
            articles = fetcher.fetch_publisher(subscription.query, limit)
            reason = f"publisher:{subscription.query}"
        else:
            articles = fetcher.search(subscription.query, limit)
            reason = f"keyword:{subscription.query}"

        items = []
        for article in articles:
            item = upsert_article_item(article)
            link_subscription_item(subscription.id, item.id, reason)
            items.append(item)
        update_subscription_refresh(subscription.id)
        return {
            "subscription_id": subscription.id,
            "count": len(items),
            "items": [self._item_payload(item) for item in items],
        }

    def summarize_item(
        self,
        item_id: int,
        provider_id: str,
        model_name: str,
        style: str = "",
        extras: str = "",
    ) -> dict:
        item = get_article_item(item_id)
        if not item:
            raise ValueError("文章不存在")
        if item.task_id and item.summary_status == "summarized":
            return {"task_id": item.task_id, "article_item_id": item.id}
        return self.generate_from_url(
            url=item.url,
            platform=item.platform,
            provider_id=provider_id,
            model_name=model_name,
            style=style,
            extras=extras,
        )

    def list_items(self, subscription_id: int | None = None) -> list[dict]:
        return [self._item_payload(item) for item in list_article_items(subscription_id)]

    def get_item(self, item_id: int) -> dict:
        item = get_article_item(item_id)
        if not item:
            raise ValueError("文章不存在")
        return self._item_payload(item, include_content=True)

    def create_subscription(
        self,
        platform: str,
        subscription_type: str,
        query: str,
        label: str = "",
    ) -> dict:
        subscription = create_subscription(platform, subscription_type, query, label)
        return self._subscription_payload(subscription)

    def list_subscriptions(self) -> list[dict]:
        return [self._subscription_payload(item) for item in list_subscriptions()]

    def _fetcher(self, platform: str) -> ArticleFetcher:
        if platform not in self.fetchers:
            raise ValueError(f"不支持的文章平台：{platform}")
        return self.fetchers[platform]

    def _item_payload(self, item, include_content: bool = False) -> dict:
        payload = {
            "id": item.id,
            "platform": item.platform,
            "title": item.title,
            "url": item.url,
            "author_name": item.author_name,
            "author_id": item.author_id,
            "cover_url": item.cover_url,
            "published_at": item.published_at,
            "summary_status": item.summary_status,
            "task_id": item.task_id,
        }
        if include_content:
            payload["content_text"] = (getattr(item, "content_text", "") or "").strip()
            if not payload["content_text"] and item.task_id:
                payload["content_text"] = self._content_from_note_result(item.task_id)
        return payload

    def _content_from_note_result(self, task_id: str) -> str:
        if not task_id:
            return ""
        payload = load_note(task_id)
        if not payload:
            return ""
        transcript = payload.get("transcript") or {}
        return str(transcript.get("full_text") or "").strip()

    def _subscription_payload(self, item) -> dict:
        return {
            "id": item.id,
            "platform": item.platform,
            "type": item.type,
            "query": item.query,
            "label": item.label,
            "enabled": item.enabled,
            "last_error": item.last_error,
        }

    def _create_gpt(self, model_name: str, provider_id: str):
        provider = ProviderService.get_provider_by_id(provider_id)
        if not provider:
            raise ValueError("请选择模型和提供者")
        return GPTFactory().from_config(
            ModelConfig(
                api_key=provider["api_key"],
                base_url=provider["base_url"],
                model_name=model_name,
                provider=provider["type"],
                name=provider["name"],
            )
        )

    def _segments(self, article: ArticleContent) -> list[TranscriptSegment]:
        paragraphs = [p.strip() for p in article.content_text.splitlines() if p.strip()]
        if not paragraphs and article.content_text.strip():
            paragraphs = [article.content_text.strip()]
        return [
            TranscriptSegment(start=float(index), end=float(index + 1), text=text)
            for index, text in enumerate(paragraphs)
        ]

    def _write_note_json(
        self,
        task_id: str,
        article: ArticleContent,
        markdown: str,
        total_tokens: int,
    ) -> None:
        segments = self._segments(article)
        payload = {
            "markdown": markdown,
            "transcript": {
                "language": "zh",
                "full_text": article.content_text,
                "segments": [
                    {"start": segment.start, "end": segment.end, "text": segment.text}
                    for segment in segments
                ],
            },
            "audio_meta": {
                "file_path": "",
                "title": article.title,
                "duration": 0,
                "cover_url": article.cover_url,
                "platform": article.platform,
                "video_id": article.article_id,
                "raw_info": {
                    "source_type": "article",
                    "url": article.url,
                    "author_name": article.author_name,
                    "author_id": article.author_id,
                    "published_at": article.published_at,
                    "image_urls": article.image_urls,
                    **(article.raw_metadata or {}),
                },
                "video_path": None,
            },
            "total_tokens": total_tokens,
        }
        save_note(task_id, payload)

    def _update_status(self, task_id: str, status: TaskStatus) -> None:
        set_status(task_id, {"status": status.value, "paused": False})

    def _index_task(self, task_id: str) -> None:
        try:
            from app.services.vector_store import VectorStoreManager

            VectorStoreManager().index_task(task_id)
        except Exception:
            pass
