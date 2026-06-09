from __future__ import annotations

import re
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from app.article_fetchers.base import ArticleContent, ArticleFetchError
from app.utils.url_parser import clean_url


def _clean_text(value: str) -> str:
    return re.sub(r"[ \t\r\f\v]+", " ", value or "").strip()


def _normalize_body(value: str) -> str:
    lines = [_clean_text(line) for line in (value or "").splitlines()]
    return "\n".join(line for line in lines if line)


def _meta_content(soup: BeautifulSoup, *selectors: tuple[str, str]) -> str:
    for attr, value in selectors:
        node = soup.find("meta", attrs={attr: value})
        if node:
            content = _clean_text(node.get("content") or "")
            if content:
                return content
    return ""


def _candidate_score(node) -> int:
    text = _normalize_body(node.get_text("\n"))
    paragraphs = node.find_all("p")
    return len(text) + len(paragraphs) * 120


def parse_generic_article_html(html: str, url: str) -> ArticleContent:
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript", "svg", "canvas", "iframe"]):
        tag.decompose()
    for tag in soup(["nav", "header", "footer", "aside", "form"]):
        tag.decompose()

    title = (
        _meta_content(soup, ("property", "og:title"), ("name", "twitter:title"))
        or _clean_text(soup.title.get_text(" ")) if soup.title else ""
    )
    author = _meta_content(soup, ("name", "author"), ("property", "article:author"))
    published_at = _meta_content(
        soup,
        ("property", "article:published_time"),
        ("name", "publishdate"),
        ("name", "date"),
    )
    cover = _meta_content(soup, ("property", "og:image"), ("name", "twitter:image"))

    candidates = []
    for selector in ("article", "main", "[role='main']", "#content", ".content", ".article", ".post"):
        candidates.extend(soup.select(selector))
    if not candidates and soup.body:
        candidates = [soup.body]
    best = max(candidates, key=_candidate_score, default=None)
    body = _normalize_body(best.get_text("\n")) if best else ""
    if len(body) < 80:
        description = _meta_content(soup, ("name", "description"), ("property", "og:description"))
        body = description if len(description) > len(body) else body
    if len(body) < 40:
        raise ValueError("网页正文为空或过短，无法生成总结")

    parsed = urlparse(url)
    article_id = parsed.netloc + parsed.path
    return ArticleContent(
        platform="generic_web",
        url=url,
        article_id=article_id or url,
        title=title or parsed.netloc or "网页文章",
        author_name=author,
        content_text=body,
        image_urls=[cover] if cover else [],
        cover_url=cover,
        published_at=published_at,
        raw_metadata={"source": "generic_web"},
    )


class GenericArticleFetcher:
    platform = "generic_web"

    def fetch(self, url: str) -> ArticleContent:
        clean = clean_url(url)
        try:
            response = requests.get(
                clean,
                timeout=12,
                allow_redirects=True,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                },
            )
            response.raise_for_status()
            return parse_generic_article_html(response.text, response.url or clean)
        except ValueError:
            raise
        except Exception as exc:
            raise ArticleFetchError(f"网页文章抓取失败：{exc}") from exc

    def search(self, keyword: str, limit: int = 20) -> list[ArticleContent]:
        raise ArticleFetchError("通用网页暂不支持关键字查询，请粘贴具体文章链接")

    def fetch_publisher(self, query: str, limit: int = 20) -> list[ArticleContent]:
        raise ArticleFetchError("通用网页暂不支持发布者订阅，请粘贴具体文章链接")
