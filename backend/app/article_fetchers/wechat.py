from __future__ import annotations

import re

import requests
from bs4 import BeautifulSoup

from app.article_fetchers.base import ArticleContent, ArticleFetchError


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _element_text(element) -> str:
    return _clean_text(element.get_text(" ")) if element else ""


def _script_value(html: str, name: str) -> str:
    patterns = [
        rf'var\s+{re.escape(name)}\s*=\s*"([^"]*)"',
        rf"{re.escape(name)}\s*:\s*'([^']*)'",
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            return match.group(1).strip()
    return ""


def parse_wechat_article_html(html: str, url: str) -> ArticleContent:
    soup = BeautifulSoup(html, "html.parser")
    title = _element_text(soup.find(id="activity-name") or soup.find("h1"))
    author = _element_text(soup.find(id="js_name"))
    published_at = _element_text(soup.find(id="publish_time"))
    content = soup.find(id="js_content")
    body = _clean_text(content.get_text("\n")) if content else ""
    if not body:
        raise ValueError("微信公众号文章正文为空，无法生成总结")

    image_urls: list[str] = []
    for image in content.find_all("img") if content else []:
        src = image.get("data-src") or image.get("src") or ""
        if src and src not in image_urls:
            image_urls.append(src)

    biz = _script_value(html, "biz")
    mid = _script_value(html, "mid")
    idx = _script_value(html, "idx")
    sn = _script_value(html, "sn")
    article_id = ":".join(part for part in [biz, mid, idx, sn] if part) or url

    return ArticleContent(
        platform="wechat_mp",
        url=url,
        article_id=article_id,
        title=title or "微信公众号文章",
        author_name=author,
        author_id=biz,
        content_text=body,
        image_urls=image_urls,
        cover_url=image_urls[0] if image_urls else "",
        published_at=published_at,
        raw_metadata={"biz": biz, "mid": mid, "idx": idx, "sn": sn},
    )


class WechatArticleFetcher:
    platform = "wechat_mp"

    def fetch(self, url: str) -> ArticleContent:
        try:
            response = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            response.raise_for_status()
            return parse_wechat_article_html(response.text, url)
        except ValueError:
            raise
        except Exception as exc:
            raise ArticleFetchError(f"微信公众号文章抓取失败：{exc}") from exc

    def search(self, keyword: str, limit: int = 20) -> list[ArticleContent]:
        return []

    def fetch_publisher(self, query: str, limit: int = 20) -> list[ArticleContent]:
        return []
