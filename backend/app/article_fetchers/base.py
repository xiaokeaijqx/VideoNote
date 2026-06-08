from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


@dataclass
class ArticleContent:
    platform: str
    url: str
    article_id: str
    title: str
    author_name: str = ""
    author_id: str = ""
    content_text: str = ""
    image_urls: list[str] = field(default_factory=list)
    cover_url: str = ""
    published_at: str = ""
    raw_metadata: dict = field(default_factory=dict)


class ArticleFetchError(Exception):
    pass


class ArticleFetcher(Protocol):
    platform: str

    def fetch(self, url: str) -> ArticleContent:
        ...

    def search(self, keyword: str, limit: int = 20) -> list[ArticleContent]:
        ...

    def fetch_publisher(self, query: str, limit: int = 20) -> list[ArticleContent]:
        ...
