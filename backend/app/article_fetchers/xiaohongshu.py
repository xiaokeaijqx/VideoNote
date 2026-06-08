from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.parse import quote, urlparse

import requests
from bs4 import BeautifulSoup

from app.article_fetchers.base import ArticleContent, ArticleFetchError
from app.services.cookie_manager import CookieConfigManager
from app.utils.url_parser import clean_url


def _note_id_from_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    return path.split("/")[-1] if path else url


def _extract_initial_state(html: str) -> dict:
    match = re.search(r"window\.__INITIAL_STATE__\s*=", html)
    if not match:
        return {}
    start = html.find("{", match.end())
    if start < 0:
        return {}
    depth = 0
    end = -1
    for index in range(start, len(html)):
        char = html[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    if end < 0:
        return {}
    raw = html[start:end].replace("undefined", "null")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _first_image_url(item: dict) -> str:
    for key in ("urlDefault", "url", "traceId"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    nested = item.get("cover") or item.get("image") or {}
    if isinstance(nested, dict):
        for key in ("urlDefault", "url"):
            value = nested.get(key)
            if isinstance(value, str) and value.startswith("http"):
                return value
    return ""


def _published_at(value) -> str:
    try:
        timestamp = int(value)
    except (TypeError, ValueError):
        return ""
    if timestamp > 10_000_000_000:
        timestamp = timestamp // 1000
    return datetime.fromtimestamp(timestamp).isoformat(timespec="seconds")


def _article_from_note(note: dict, url: str) -> ArticleContent:
    user = note.get("user") or {}
    images: list[str] = []
    for image in note.get("imageList") or note.get("images") or []:
        src = _first_image_url(image)
        if src and src not in images:
            images.append(src)

    content = str(note.get("desc") or note.get("description") or "").strip()
    title = str(note.get("title") or "").strip() or content[:40] or "小红书笔记"
    article_id = str(note.get("noteId") or note.get("id") or _note_id_from_url(url)).strip()
    if not content:
        raise ValueError("小红书笔记正文为空，无法生成总结")

    return ArticleContent(
        platform="xiaohongshu",
        url=url,
        article_id=article_id,
        title=title,
        author_name=str(user.get("nickname") or "").strip(),
        author_id=str(user.get("userId") or user.get("id") or "").strip(),
        content_text=content,
        image_urls=images,
        cover_url=images[0] if images else "",
        published_at=_published_at(note.get("time") or note.get("lastUpdateTime")),
        raw_metadata={"raw_note": note},
    )


def parse_xiaohongshu_article_html(html: str, url: str) -> ArticleContent:
    state = _extract_initial_state(html)
    detail_map = ((state.get("note") or {}).get("noteDetailMap")) or {}
    for value in detail_map.values():
        note = value.get("note") if isinstance(value, dict) else None
        if isinstance(note, dict):
            return _article_from_note(note, url)

    soup = BeautifulSoup(html, "html.parser")
    title_meta = soup.find("meta", attrs={"property": "og:title"})
    desc_meta = soup.find("meta", attrs={"name": "description"})
    title = (title_meta.get("content") if title_meta else "") or "小红书笔记"
    body = (desc_meta.get("content") if desc_meta else "").strip()
    if not body:
        raise ValueError("小红书笔记正文为空，无法生成总结")

    return ArticleContent(
        platform="xiaohongshu",
        url=url,
        article_id=_note_id_from_url(url),
        title=title.strip(),
        content_text=body,
    )


def _iter_note_like(value):
    if isinstance(value, dict):
        note_id = value.get("noteId") or value.get("id")
        title = value.get("title") or value.get("displayTitle")
        desc = value.get("desc") or value.get("description")
        if note_id and (title or desc):
            yield value
        for child in value.values():
            yield from _iter_note_like(child)
    elif isinstance(value, list):
        for child in value:
            yield from _iter_note_like(child)


def parse_xiaohongshu_discovery_html(
    html: str,
    source_url: str,
    limit: int = 20,
) -> list[ArticleContent]:
    state = _extract_initial_state(html)
    items: list[ArticleContent] = []
    seen: set[str] = set()
    for note in _iter_note_like(state):
        article_id = str(note.get("noteId") or note.get("id") or "").strip()
        if not article_id or article_id in seen:
            continue
        user = note.get("user") or note.get("author") or {}
        image_url = _first_image_url(note)
        content = str(note.get("desc") or note.get("description") or note.get("title") or "").strip()
        title = str(note.get("title") or note.get("displayTitle") or content[:40] or "小红书笔记").strip()
        seen.add(article_id)
        items.append(
            ArticleContent(
                platform="xiaohongshu",
                url=f"https://www.xiaohongshu.com/explore/{article_id}",
                article_id=article_id,
                title=title,
                author_name=str(user.get("nickname") or user.get("name") or "").strip(),
                author_id=str(user.get("userId") or user.get("id") or "").strip(),
                content_text=content,
                image_urls=[image_url] if image_url else [],
                cover_url=image_url,
                raw_metadata={"source_url": source_url},
            )
        )
        if len(items) >= limit:
            break
    return items


class XiaohongshuArticleFetcher:
    platform = "xiaohongshu"

    def __init__(self):
        self._cookie_mgr = CookieConfigManager()

    def _headers(self) -> dict:
        headers = {"User-Agent": "Mozilla/5.0"}
        cookie = self._cookie_mgr.get("xiaohongshu")
        if cookie:
            headers["Cookie"] = cookie
        return headers

    def fetch(self, url: str) -> ArticleContent:
        clean = clean_url(url)
        try:
            response = requests.get(clean, timeout=10, headers=self._headers(), allow_redirects=True)
            response.raise_for_status()
            return parse_xiaohongshu_article_html(response.text, response.url or clean)
        except ValueError:
            raise
        except Exception as exc:
            raise ArticleFetchError(f"小红书笔记抓取失败：{exc}") from exc

    def search(self, keyword: str, limit: int = 20) -> list[ArticleContent]:
        url = f"https://www.xiaohongshu.com/search_result?keyword={quote(keyword)}"
        try:
            response = requests.get(url, timeout=10, headers=self._headers())
            response.raise_for_status()
            return parse_xiaohongshu_discovery_html(response.text, url, limit)
        except Exception as exc:
            raise ArticleFetchError(f"小红书关键字查询失败：{exc}") from exc

    def fetch_publisher(self, query: str, limit: int = 20) -> list[ArticleContent]:
        url = clean_url(query)
        if not url.startswith("http"):
            url = f"https://www.xiaohongshu.com/user/profile/{quote(query)}"
        try:
            response = requests.get(url, timeout=10, headers=self._headers(), allow_redirects=True)
            response.raise_for_status()
            return parse_xiaohongshu_discovery_html(response.text, response.url or url, limit)
        except Exception as exc:
            raise ArticleFetchError(f"小红书发布者订阅刷新失败：{exc}") from exc
