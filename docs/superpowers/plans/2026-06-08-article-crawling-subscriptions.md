# Article Crawling Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Xiaohongshu and WeChat official account article crawling, summarization, keyword search/subscriptions, and publisher subscriptions.

**Architecture:** Create a separate backend article domain with normalized fetchers, article/subscription database tables, article APIs, and an article frontend workspace. Article summaries are saved in the existing `note_results/{task_id}.json` compatibility shape so current note display, export, manual edit, and vector indexing continue to work.

**Tech Stack:** FastAPI, SQLAlchemy, SQLite, pytest, React 19, Vite, TypeScript, Tailwind/shadcn-style local components, Zustand stores, Axios request wrapper.

---

## File Structure

Backend files to create:

- `backend/app/article_fetchers/__init__.py`: exports fetcher types.
- `backend/app/article_fetchers/base.py`: normalized article dataclasses, exceptions, and abstract fetcher interface.
- `backend/app/article_fetchers/wechat.py`: parses and fetches WeChat official account articles.
- `backend/app/article_fetchers/xiaohongshu.py`: parses and fetches Xiaohongshu article/image notes.
- `backend/app/db/models/articles.py`: SQLAlchemy models for article items, subscriptions, and subscription-item links.
- `backend/app/db/article_dao.py`: focused database functions for articles and subscriptions.
- `backend/app/services/article.py`: summarization, search, refresh, dedupe, note JSON persistence, task status, and vector indexing.
- `backend/app/routers/article.py`: FastAPI article routes.
- `backend/tests/test_article_fetchers_wechat.py`: parser tests with fixture HTML.
- `backend/tests/test_article_fetchers_xiaohongshu.py`: parser tests with fixture HTML/script data.
- `backend/tests/test_article_dao.py`: table persistence and dedupe tests.
- `backend/tests/test_article_service.py`: generation/search/refresh service tests using fake fetchers and fake GPT.
- `backend/tests/test_article_routes.py`: API contract tests.

Backend files to modify:

- `backend/app/db/init_db.py`: import article models before `Base.metadata.create_all`.
- `backend/app/__init__.py`: register `article.router` under `/api`.
- `backend/app/enmus/task_status_enums.py`: no change for phase 1; article service reuses current statuses.

Frontend files to create:

- `VideoMemo_frontend/src/services/article.ts`: typed article API client.
- `VideoMemo_frontend/src/pages/Articles/index.tsx`: direct summarization, keyword search, subscriptions, and discovered article workspace.

Frontend files to modify:

- `VideoMemo_frontend/src/App.tsx`: lazy-load and register `/articles`.
- `VideoMemo_frontend/src/layouts/MainLayout.tsx`: add sidebar nav item and page metadata.
- `VideoMemo_frontend/src/i18n/redesign.ts`: add labels for the Articles workspace.
- `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`: add compact entry point to `/articles`.

---

### Task 1: WeChat Article Parser

**Files:**
- Create: `backend/app/article_fetchers/__init__.py`
- Create: `backend/app/article_fetchers/base.py`
- Create: `backend/app/article_fetchers/wechat.py`
- Test: `backend/tests/test_article_fetchers_wechat.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_article_fetchers_wechat.py`:

```python
from app.article_fetchers.wechat import parse_wechat_article_html


WECHAT_HTML = """
<html>
  <head><title>ignored</title></head>
  <body>
    <h1 id="activity-name">  一篇公众号文章标题  </h1>
    <span id="js_name">  VideoMemo实验室  </span>
    <em id="publish_time">2026-06-08</em>
    <div id="js_content">
      <p>第一段正文</p>
      <p><strong>第二段正文</strong></p>
      <img data-src="https://mmbiz.qpic.cn/example.jpg" />
    </div>
    <script>
      var biz = "MzExample";
      var mid = "123456";
      var idx = "1";
      var sn = "abcdef";
    </script>
  </body>
</html>
"""


def test_parse_wechat_article_extracts_core_fields():
    article = parse_wechat_article_html(
        WECHAT_HTML,
        "https://mp.weixin.qq.com/s/example",
    )

    assert article.platform == "wechat_mp"
    assert article.article_id == "MzExample:123456:1:abcdef"
    assert article.title == "一篇公众号文章标题"
    assert article.author_name == "VideoMemo实验室"
    assert article.published_at == "2026-06-08"
    assert "第一段正文" in article.content_text
    assert "第二段正文" in article.content_text
    assert article.image_urls == ["https://mmbiz.qpic.cn/example.jpg"]


def test_parse_wechat_article_fails_when_body_is_empty():
    html = '<h1 id="activity-name">标题</h1><div id="js_content"></div>'

    try:
        parse_wechat_article_html(html, "https://mp.weixin.qq.com/s/empty")
    except ValueError as exc:
        assert "正文" in str(exc)
    else:
        raise AssertionError("expected parser to reject empty article body")
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_article_fetchers_wechat.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.article_fetchers'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/article_fetchers/base.py`:

```python
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
```

Create `backend/app/article_fetchers/__init__.py`:

```python
from app.article_fetchers.base import ArticleContent, ArticleFetchError, ArticleFetcher

__all__ = ["ArticleContent", "ArticleFetchError", "ArticleFetcher"]
```

Create `backend/app/article_fetchers/wechat.py`:

```python
from __future__ import annotations

import re

import requests
from bs4 import BeautifulSoup

from app.article_fetchers.base import ArticleContent, ArticleFetchError


def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


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
    title = _clean_text((soup.find(id="activity-name") or soup.find("h1") or {}).get_text(" "))
    author = _clean_text((soup.find(id="js_name") or {}).get_text(" "))
    published_at = _clean_text((soup.find(id="publish_time") or {}).get_text(" "))
    content = soup.find(id="js_content")
    body = _clean_text(content.get_text("\n")) if content else ""
    if not body:
        raise ValueError("微信公众号文章正文为空，无法生成总结")

    image_urls: list[str] = []
    if content:
        for image in content.find_all("img"):
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_article_fetchers_wechat.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/article_fetchers backend/tests/test_article_fetchers_wechat.py
git commit -m "feat(articles): parse wechat articles"
```

---

### Task 2: Xiaohongshu Article Parser

**Files:**
- Create: `backend/app/article_fetchers/xiaohongshu.py`
- Test: `backend/tests/test_article_fetchers_xiaohongshu.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_article_fetchers_xiaohongshu.py`:

```python
from app.article_fetchers.xiaohongshu import parse_xiaohongshu_article_html


XHS_HTML = """
<html>
  <head>
    <script>
      window.__INITIAL_STATE__ = {
        "note": {
          "noteDetailMap": {
            "abc123": {
              "note": {
                "noteId": "abc123",
                "title": "小红书图文标题",
                "desc": "第一段\\n第二段",
                "user": {"userId": "u1", "nickname": "作者A"},
                "imageList": [
                  {"urlDefault": "https://sns-img-qc.xhscdn.com/a.jpg"},
                  {"url": "https://sns-img-qc.xhscdn.com/b.jpg"}
                ],
                "time": 1780905600000
              }
            }
          }
        }
      };
    </script>
  </head>
</html>
"""


def test_parse_xiaohongshu_article_extracts_embedded_note():
    article = parse_xiaohongshu_article_html(
        XHS_HTML,
        "https://www.xiaohongshu.com/explore/abc123",
    )

    assert article.platform == "xiaohongshu"
    assert article.article_id == "abc123"
    assert article.title == "小红书图文标题"
    assert article.author_name == "作者A"
    assert article.author_id == "u1"
    assert "第一段" in article.content_text
    assert "第二段" in article.content_text
    assert article.cover_url == "https://sns-img-qc.xhscdn.com/a.jpg"
    assert article.image_urls == [
        "https://sns-img-qc.xhscdn.com/a.jpg",
        "https://sns-img-qc.xhscdn.com/b.jpg",
    ]


def test_parse_xiaohongshu_article_falls_back_to_meta_text():
    html = """
    <meta property="og:title" content="备用标题" />
    <meta name="description" content="备用正文" />
    """

    article = parse_xiaohongshu_article_html(html, "https://www.xiaohongshu.com/explore/fallback")

    assert article.article_id == "fallback"
    assert article.title == "备用标题"
    assert article.content_text == "备用正文"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_article_fetchers_xiaohongshu.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.article_fetchers.xiaohongshu'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/article_fetchers/xiaohongshu.py`:

```python
from __future__ import annotations

import json
import re
from datetime import datetime
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

from app.article_fetchers.base import ArticleContent, ArticleFetchError
from app.services.cookie_manager import CookieConfigManager
from app.utils.url_parser import clean_url


def _note_id_from_url(url: str) -> str:
    path = urlparse(url).path.rstrip("/")
    return path.split("/")[-1] if path else url


def _extract_initial_state(html: str) -> dict:
    match = re.search(r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;</script>", html, re.S)
    if not match:
        return {}
    raw = match.group(1).replace("undefined", "null")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {}


def _first_image_url(item: dict) -> str:
    for key in ("urlDefault", "url", "traceId"):
        value = item.get(key)
        if isinstance(value, str) and value.startswith("http"):
            return value
    return ""


def _published_at(value) -> str:
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return ""
    if ts > 10_000_000_000:
        ts = ts // 1000
    return datetime.fromtimestamp(ts).isoformat(timespec="seconds")


def _article_from_note(note: dict, url: str) -> ArticleContent:
    user = note.get("user") or {}
    images = []
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
    detail_map = (((state.get("note") or {}).get("noteDetailMap")) or {})
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


class XiaohongshuArticleFetcher:
    platform = "xiaohongshu"

    def __init__(self):
        self._cookie_mgr = CookieConfigManager()

    def fetch(self, url: str) -> ArticleContent:
        clean = clean_url(url)
        headers = {"User-Agent": "Mozilla/5.0"}
        cookie = self._cookie_mgr.get("xiaohongshu")
        if cookie:
            headers["Cookie"] = cookie
        try:
            response = requests.get(clean, timeout=10, headers=headers, allow_redirects=True)
            response.raise_for_status()
            return parse_xiaohongshu_article_html(response.text, response.url or clean)
        except ValueError:
            raise
        except Exception as exc:
            raise ArticleFetchError(f"小红书笔记抓取失败：{exc}") from exc

    def search(self, keyword: str, limit: int = 20) -> list[ArticleContent]:
        return []

    def fetch_publisher(self, query: str, limit: int = 20) -> list[ArticleContent]:
        return []
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_article_fetchers_xiaohongshu.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/article_fetchers/xiaohongshu.py backend/tests/test_article_fetchers_xiaohongshu.py
git commit -m "feat(articles): parse xiaohongshu notes"
```

---

### Task 3: Article Database Models And DAO

**Files:**
- Create: `backend/app/db/models/articles.py`
- Create: `backend/app/db/article_dao.py`
- Modify: `backend/app/db/init_db.py`
- Test: `backend/tests/test_article_dao.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_article_dao.py`:

```python
from app.article_fetchers.base import ArticleContent
from app.db.article_dao import (
    create_subscription,
    get_article_item,
    link_subscription_item,
    list_article_items,
    list_subscriptions,
    upsert_article_item,
)
from app.db.init_db import init_db


def test_upsert_article_item_dedupes_by_platform_and_article_id(tmp_path, monkeypatch):
    db_path = tmp_path / "articles.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    init_db()
    article = ArticleContent(
        platform="wechat_mp",
        url="https://mp.weixin.qq.com/s/a",
        article_id="biz:mid:1:sn",
        title="标题",
        author_name="公众号",
        content_text="正文",
    )

    first = upsert_article_item(article)
    second = upsert_article_item(article)

    assert first.id == second.id
    assert len(list_article_items()) == 1


def test_create_subscription_and_link_item(tmp_path, monkeypatch):
    db_path = tmp_path / "subscriptions.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")
    init_db()
    article = upsert_article_item(
        ArticleContent(
            platform="xiaohongshu",
            url="https://www.xiaohongshu.com/explore/a",
            article_id="a",
            title="小红书标题",
            content_text="正文",
        )
    )

    subscription = create_subscription(
        platform="xiaohongshu",
        subscription_type="keyword",
        query="AI",
        label="AI",
    )
    link_subscription_item(subscription.id, article.id, "keyword:AI")

    assert list_subscriptions()[0].query == "AI"
    assert get_article_item(article.id).title == "小红书标题"
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_article_dao.py -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.db.article_dao'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/db/models/articles.py`:

```python
from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func

from app.db.engine import Base


class ArticleItem(Base):
    __tablename__ = "article_items"
    __table_args__ = (
        UniqueConstraint("platform", "article_id", name="uq_article_platform_article_id"),
        UniqueConstraint("platform", "url_hash", name="uq_article_platform_url_hash"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String, nullable=False)
    article_id = Column(String, nullable=False, default="")
    url = Column(Text, nullable=False)
    url_hash = Column(String, nullable=False)
    title = Column(String, nullable=False)
    author_name = Column(String, nullable=False, default="")
    author_id = Column(String, nullable=False, default="")
    summary_status = Column(String, nullable=False, default="pending")
    task_id = Column(String, nullable=False, default="")
    cover_url = Column(Text, nullable=False, default="")
    published_at = Column(String, nullable=False, default="")
    discovered_at = Column(DateTime, server_default=func.now())
    raw_metadata = Column(Text, nullable=False, default="{}")


class ArticleSubscription(Base):
    __tablename__ = "article_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    platform = Column(String, nullable=False)
    type = Column(String, nullable=False)
    query = Column(Text, nullable=False)
    label = Column(String, nullable=False, default="")
    enabled = Column(Boolean, nullable=False, default=True)
    last_refresh_at = Column(DateTime, nullable=True)
    last_error = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ArticleSubscriptionItem(Base):
    __tablename__ = "article_subscription_items"
    __table_args__ = (
        UniqueConstraint("subscription_id", "article_item_id", name="uq_subscription_article_item"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    subscription_id = Column(Integer, ForeignKey("article_subscriptions.id"), nullable=False)
    article_item_id = Column(Integer, ForeignKey("article_items.id"), nullable=False)
    matched_at = Column(DateTime, server_default=func.now())
    match_reason = Column(Text, nullable=False, default="")
```

Modify `backend/app/db/init_db.py`:

```python
from app.db.models.articles import ArticleItem, ArticleSubscription, ArticleSubscriptionItem
from app.db.models.models import Model
from app.db.models.providers import Provider
from app.db.models.video_tasks import VideoTask
from app.db.engine import get_engine, Base


def init_db():
    engine = get_engine()
    Base.metadata.create_all(bind=engine)
```

Create `backend/app/db/article_dao.py`:

```python
from __future__ import annotations

import hashlib
import json
from dataclasses import asdict

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
            item = ArticleItem(platform=article.platform, article_id=article.article_id, url_hash=digest, url=article.url, title=article.title)
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


def create_subscription(platform: str, subscription_type: str, query: str, label: str = "") -> ArticleSubscription:
    db = next(get_db())
    try:
        subscription = ArticleSubscription(platform=platform, type=subscription_type, query=query, label=label or query)
        db.add(subscription)
        db.commit()
        db.refresh(subscription)
        return _detach(subscription)
    finally:
        db.close()


def list_subscriptions() -> list[ArticleSubscription]:
    db = next(get_db())
    try:
        return [_detach(item) for item in db.query(ArticleSubscription).order_by(ArticleSubscription.id.desc()).all()]
    finally:
        db.close()


def get_subscription(subscription_id: int) -> ArticleSubscription | None:
    db = next(get_db())
    try:
        item = db.query(ArticleSubscription).filter_by(id=subscription_id).first()
        return _detach(item) if item else None
    finally:
        db.close()


def link_subscription_item(subscription_id: int, article_item_id: int, match_reason: str) -> None:
    db = next(get_db())
    try:
        existing = db.query(ArticleSubscriptionItem).filter_by(subscription_id=subscription_id, article_item_id=article_item_id).first()
        if existing is None:
            db.add(ArticleSubscriptionItem(subscription_id=subscription_id, article_item_id=article_item_id, match_reason=match_reason))
            db.commit()
    finally:
        db.close()
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_article_dao.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/models/articles.py backend/app/db/article_dao.py backend/app/db/init_db.py backend/tests/test_article_dao.py
git commit -m "feat(articles): add article persistence"
```

---

### Task 4: Article Service Direct Generation

**Files:**
- Create: `backend/app/services/article.py`
- Test: `backend/tests/test_article_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_article_service.py`:

```python
import json

from app.article_fetchers.base import ArticleContent
from app.services.article import ArticleService


class FakeGPT:
    total_tokens = 42

    def summarize(self, source):
        assert "正文内容" in source.content
        return "# 总结\n\n- 要点"


class FakeFetcher:
    platform = "wechat_mp"

    def fetch(self, url):
        return ArticleContent(
            platform="wechat_mp",
            url=url,
            article_id="article-1",
            title="文章标题",
            author_name="作者",
            content_text="正文内容",
            cover_url="https://example.com/cover.jpg",
        )

    def search(self, keyword: str, limit: int = 20):
        return []

    def fetch_publisher(self, query: str, limit: int = 20):
        return []


def test_generate_from_url_saves_note_json(tmp_path, monkeypatch):
    monkeypatch.setenv("NOTE_OUTPUT_DIR", str(tmp_path))
    service = ArticleService(fetchers={"wechat_mp": FakeFetcher()}, gpt_factory=lambda *_: FakeGPT())

    result = service.generate_from_url(
        url="https://mp.weixin.qq.com/s/a",
        platform="wechat_mp",
        provider_id="provider",
        model_name="model",
        style="minimal",
        extras="",
        task_id="task-1",
    )

    saved = json.loads((tmp_path / "task-1.json").read_text(encoding="utf-8"))
    assert result["task_id"] == "task-1"
    assert saved["markdown"] == "# 总结\n\n- 要点"
    assert saved["transcript"]["full_text"] == "正文内容"
    assert saved["audio_meta"]["title"] == "文章标题"
    assert saved["audio_meta"]["platform"] == "wechat_mp"
    assert saved["audio_meta"]["video_id"] == "article-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd backend
pytest tests/test_article_service.py::test_generate_from_url_saves_note_json -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.article'`.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/services/article.py`:

```python
from __future__ import annotations

import json
import os
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Callable

from app.article_fetchers.base import ArticleContent, ArticleFetcher
from app.article_fetchers.wechat import WechatArticleFetcher
from app.article_fetchers.xiaohongshu import XiaohongshuArticleFetcher
from app.db.article_dao import mark_article_summarized, upsert_article_item
from app.enmus.task_status_enums import TaskStatus
from app.gpt.gpt_factory import GPTFactory
from app.models.gpt_model import GPTSource
from app.models.model_config import ModelConfig
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
        self._update_status(task_id, TaskStatus.PARSING)
        article = self._fetcher(platform).fetch(url)
        item = upsert_article_item(article)
        self._update_status(task_id, TaskStatus.TRANSCRIBING)
        gpt = self.gpt_factory(model_name, provider_id)
        markdown = gpt.summarize(
            GPTSource(
                content=self._prompt_content(article),
                time_list=[],
                title=article.title,
                link=article.url,
                style=style,
                extras=extras,
            )
        )
        self._update_status(task_id, TaskStatus.SAVING)
        self._write_note_json(task_id, article, markdown, int(getattr(gpt, "total_tokens", 0) or 0))
        mark_article_summarized(item.id, task_id)
        self._update_status(task_id, TaskStatus.SUCCESS)
        self._index_task(task_id)
        return {"task_id": task_id, "article_item_id": item.id}

    def _fetcher(self, platform: str) -> ArticleFetcher:
        if platform not in self.fetchers:
            raise ValueError(f"不支持的文章平台：{platform}")
        return self.fetchers[platform]

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

    def _prompt_content(self, article: ArticleContent) -> str:
        return "\n".join(
            [
                f"标题：{article.title}",
                f"作者：{article.author_name}",
                f"发布时间：{article.published_at}",
                f"原文链接：{article.url}",
                "",
                article.content_text,
            ]
        )

    def _write_note_json(self, task_id: str, article: ArticleContent, markdown: str, total_tokens: int) -> None:
        paragraphs = [p.strip() for p in article.content_text.splitlines() if p.strip()]
        payload = {
            "markdown": markdown,
            "transcript": {
                "language": "zh",
                "full_text": article.content_text,
                "segments": [
                    {"start": index, "end": index + 1, "text": text}
                    for index, text in enumerate(paragraphs)
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
        (_note_output_dir() / f"{task_id}.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _update_status(self, task_id: str, status: TaskStatus) -> None:
        payload = {"status": status.value, "paused": False}
        (_note_output_dir() / f"{task_id}.status.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _index_task(self, task_id: str) -> None:
        try:
            from app.services.vector_store import VectorStoreManager
            VectorStoreManager().index_task(task_id)
        except Exception:
            pass
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
cd backend
pytest tests/test_article_service.py::test_generate_from_url_saves_note_json -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/article.py backend/tests/test_article_service.py
git commit -m "feat(articles): generate article notes"
```

---

### Task 5: Article Search And Subscription Refresh Service

**Files:**
- Modify: `backend/app/services/article.py`
- Modify: `backend/app/db/article_dao.py`
- Test: `backend/tests/test_article_service.py`

- [ ] **Step 1: Add failing tests**

Append to `backend/tests/test_article_service.py`:

```python
from app.db.article_dao import create_subscription, list_article_items, list_subscriptions


class SearchFetcher(FakeFetcher):
    platform = "xiaohongshu"

    def search(self, keyword: str, limit: int = 20):
        return [
            ArticleContent(
                platform="xiaohongshu",
                url="https://www.xiaohongshu.com/explore/search-1",
                article_id="search-1",
                title=f"{keyword} 搜索结果",
                author_name="作者",
                content_text="正文",
            )
        ]

    def fetch_publisher(self, query: str, limit: int = 20):
        return [
            ArticleContent(
                platform="xiaohongshu",
                url="https://www.xiaohongshu.com/explore/pub-1",
                article_id="pub-1",
                title=f"{query} 发布者结果",
                author_name=query,
                author_id=query,
                content_text="正文",
            )
        ]


def test_search_by_keyword_persists_results(tmp_path, monkeypatch):
    monkeypatch.setenv("NOTE_OUTPUT_DIR", str(tmp_path))
    service = ArticleService(fetchers={"xiaohongshu": SearchFetcher()}, gpt_factory=lambda *_: FakeGPT())

    result = service.search(platform="xiaohongshu", keyword="AI", limit=10)

    assert result["status"] == "ok"
    assert result["items"][0]["title"] == "AI 搜索结果"
    assert len(list_article_items()) >= 1


def test_refresh_keyword_subscription_links_items(tmp_path, monkeypatch):
    monkeypatch.setenv("NOTE_OUTPUT_DIR", str(tmp_path))
    service = ArticleService(fetchers={"xiaohongshu": SearchFetcher()}, gpt_factory=lambda *_: FakeGPT())
    subscription = create_subscription("xiaohongshu", "keyword", "AI", "AI")

    result = service.refresh_subscription(subscription.id)

    assert result["subscription_id"] == subscription.id
    assert result["count"] == 1
    assert list_subscriptions()[0].query == "AI"


def test_refresh_publisher_subscription_links_items(tmp_path, monkeypatch):
    monkeypatch.setenv("NOTE_OUTPUT_DIR", str(tmp_path))
    service = ArticleService(fetchers={"xiaohongshu": SearchFetcher()}, gpt_factory=lambda *_: FakeGPT())
    subscription = create_subscription("xiaohongshu", "publisher", "作者", "作者")

    result = service.refresh_subscription(subscription.id)

    assert result["count"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_article_service.py::test_search_by_keyword_persists_results tests/test_article_service.py::test_refresh_keyword_subscription_links_items tests/test_article_service.py::test_refresh_publisher_subscription_links_items -v
```

Expected: FAIL with `AttributeError: 'ArticleService' object has no attribute 'search'`.

- [ ] **Step 3: Write minimal implementation**

Add to `backend/app/db/article_dao.py`:

```python
from datetime import datetime


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
```

Add to `backend/app/services/article.py` imports:

```python
from app.db.article_dao import (
    get_article_item,
    get_subscription,
    link_subscription_item,
    list_article_items,
    mark_article_summarized,
    update_subscription_refresh,
    upsert_article_item,
)
```

Add methods to `ArticleService`:

```python
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

    def _item_payload(self, item) -> dict:
        return {
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_article_service.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/article.py backend/app/db/article_dao.py backend/tests/test_article_service.py
git commit -m "feat(articles): add search and subscriptions"
```

---

### Task 6: Article API Routes

**Files:**
- Create: `backend/app/routers/article.py`
- Modify: `backend/app/__init__.py`
- Test: `backend/tests/test_article_routes.py`

- [ ] **Step 1: Write failing route tests**

Create `backend/tests/test_article_routes.py`:

```python
from fastapi.testclient import TestClient

from app import create_app
from app.article_fetchers.base import ArticleContent


class FakeService:
    def generate_from_url(self, **kwargs):
        return {"task_id": kwargs.get("task_id") or "task-1", "article_item_id": 1}

    def search(self, platform, keyword, limit=20):
        return {"platform": platform, "keyword": keyword, "status": "ok", "message": "", "items": []}

    def create_subscription(self, platform, subscription_type, query, label=""):
        return {"id": 1, "platform": platform, "type": subscription_type, "query": query, "label": label}

    def list_subscriptions(self):
        return []

    def refresh_subscription(self, subscription_id, limit=20):
        return {"subscription_id": subscription_id, "count": 0, "items": []}

    def list_items(self, subscription_id=None):
        return []

    def summarize_item(self, item_id, **kwargs):
        return {"task_id": "task-1", "article_item_id": item_id}


def app_with_fake_service(monkeypatch):
    from app.routers import article

    monkeypatch.setattr(article, "ArticleService", lambda: FakeService())
    return TestClient(create_app(lifespan=None))


def test_generate_article_route(monkeypatch):
    client = app_with_fake_service(monkeypatch)

    response = client.post(
        "/api/articles/generate",
        json={
            "url": "https://mp.weixin.qq.com/s/a",
            "platform": "wechat_mp",
            "provider_id": "p",
            "model_name": "m",
            "style": "minimal",
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["task_id"] == "task-1"


def test_article_subscription_routes(monkeypatch):
    client = app_with_fake_service(monkeypatch)

    created = client.post(
        "/api/article_subscriptions",
        json={"platform": "wechat_mp", "type": "publisher", "query": "账号", "label": "账号"},
    )
    refreshed = client.post("/api/article_subscriptions/1/refresh")

    assert created.status_code == 200
    assert refreshed.json()["data"]["subscription_id"] == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
cd backend
pytest tests/test_article_routes.py -v
```

Expected: FAIL because `app.routers.article` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `backend/app/routers/article.py`:

```python
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.db.article_dao import create_subscription, list_subscriptions
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


@router.get("/articles/search")
def search_articles(platform: str, keyword: str, limit: int = 20):
    return R.success(ArticleService().search(platform=platform, keyword=keyword, limit=limit))


@router.post("/article_subscriptions")
def create_article_subscription(data: SubscriptionRequest):
    subscription = create_subscription(data.platform, data.type, data.query, data.label)
    return R.success({
        "id": subscription.id,
        "platform": subscription.platform,
        "type": subscription.type,
        "query": subscription.query,
        "label": subscription.label,
        "enabled": subscription.enabled,
    })


@router.get("/article_subscriptions")
def get_article_subscriptions():
    return R.success([
        {
            "id": item.id,
            "platform": item.platform,
            "type": item.type,
            "query": item.query,
            "label": item.label,
            "enabled": item.enabled,
            "last_error": item.last_error,
        }
        for item in list_subscriptions()
    ])


@router.post("/article_subscriptions/{subscription_id}/refresh")
def refresh_article_subscription(subscription_id: int, limit: int = 20):
    return R.success(ArticleService().refresh_subscription(subscription_id, limit=limit))


@router.get("/article_items")
def get_article_items(subscription_id: Optional[int] = None):
    return R.success(ArticleService().list_items(subscription_id=subscription_id))


@router.post("/article_items/{item_id}/summarize")
def summarize_article_item(item_id: int, data: SummarizeItemRequest):
    return R.success(
        ArticleService().summarize_item(
            item_id=item_id,
            provider_id=data.provider_id,
            model_name=data.model_name,
            style=data.style,
            extras=data.extras,
        )
    )
```

Modify `backend/app/__init__.py`:

```python
def create_app(lifespan) -> FastAPI:
    from .routers import note, provider, model, config, chat, flashcard, hot_videos, article
    from .utils.response import ResponseWrapper as R

    app = FastAPI(title="VideoMemo", lifespan=lifespan)
    protected = [Depends(verify_web_access_password)]

    @app.get("/sys_check")
    async def root_sys_check():
        return R.success()

    app.include_router(note.router, prefix="/api", dependencies=protected)
    app.include_router(provider.router, prefix="/api", dependencies=protected)
    app.include_router(model.router, prefix="/api", dependencies=protected)
    app.include_router(config.router, prefix="/api", dependencies=protected)
    app.include_router(chat.router, prefix="/api", dependencies=protected)
    app.include_router(flashcard.router, prefix="/api", dependencies=protected)
    app.include_router(hot_videos.router, prefix="/api", dependencies=protected)
    app.include_router(article.router, prefix="/api", dependencies=protected)

    return app
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
cd backend
pytest tests/test_article_routes.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/article.py backend/app/__init__.py backend/tests/test_article_routes.py
git commit -m "feat(articles): expose article APIs"
```

---

### Task 7: Backend Verification

**Files:**
- No code files unless failures reveal a defect.

- [ ] **Step 1: Run focused backend article tests**

Run:

```bash
cd backend
pytest tests/test_article_fetchers_wechat.py tests/test_article_fetchers_xiaohongshu.py tests/test_article_dao.py tests/test_article_service.py tests/test_article_routes.py -v
```

Expected: PASS.

- [ ] **Step 2: Run existing affected backend tests**

Run:

```bash
cd backend
pytest tests/test_hot_videos_route.py tests/test_task_serial_executor.py tests/test_note_helper.py -v
```

Expected: PASS.

- [ ] **Step 3: Commit any verification fixes**

Only if Step 1 or 2 required code changes:

```bash
git add backend/app backend/tests
git commit -m "fix(articles): stabilize article backend tests"
```

---

### Task 8: Frontend Article API Client

**Files:**
- Create: `VideoMemo_frontend/src/services/article.ts`

- [ ] **Step 1: Create typed API client**

Create `VideoMemo_frontend/src/services/article.ts`:

```ts
import request from '@/utils/request'

export type ArticlePlatform = 'xiaohongshu' | 'wechat_mp'
export type ArticleSubscriptionType = 'keyword' | 'publisher'

export interface ArticleItem {
  id: number
  platform: ArticlePlatform
  title: string
  url: string
  author_name: string
  author_id: string
  cover_url: string
  published_at: string
  summary_status: 'pending' | 'summarizing' | 'summarized' | 'failed' | string
  task_id: string
}

export interface ArticleSubscription {
  id: number
  platform: ArticlePlatform
  type: ArticleSubscriptionType
  query: string
  label: string
  enabled: boolean
  last_error: string
}

export const generateArticle = async (data: {
  url: string
  platform: ArticlePlatform
  provider_id: string
  model_name: string
  style: string
  extras?: string
  task_id?: string
}): Promise<{ task_id: string; article_item_id: number }> => {
  return await request.post('/articles/generate', data)
}

export const searchArticles = async (params: {
  platform: ArticlePlatform
  keyword: string
  limit?: number
}): Promise<{ platform: ArticlePlatform; keyword: string; status: string; message: string; items: ArticleItem[] }> => {
  return await request.get('/articles/search', { params })
}

export const createArticleSubscription = async (data: {
  platform: ArticlePlatform
  type: ArticleSubscriptionType
  query: string
  label?: string
}): Promise<ArticleSubscription> => {
  return await request.post('/article_subscriptions', data)
}

export const listArticleSubscriptions = async (): Promise<ArticleSubscription[]> => {
  return await request.get('/article_subscriptions')
}

export const refreshArticleSubscription = async (
  id: number,
): Promise<{ subscription_id: number; count: number; items: ArticleItem[] }> => {
  return await request.post(`/article_subscriptions/${encodeURIComponent(id)}/refresh`)
}

export const listArticleItems = async (subscriptionId?: number): Promise<ArticleItem[]> => {
  return await request.get('/article_items', {
    params: subscriptionId ? { subscription_id: subscriptionId } : undefined,
  })
}

export const summarizeArticleItem = async (
  id: number,
  data: { provider_id: string; model_name: string; style: string; extras?: string },
): Promise<{ task_id: string; article_item_id: number }> => {
  return await request.post(`/article_items/${encodeURIComponent(id)}/summarize`, data)
}
```

- [ ] **Step 2: Run frontend type/build check**

Run:

```bash
cd VideoMemo_frontend
pnpm build
```

Expected: PASS or fail only on pre-existing unrelated errors. If the new file causes a type error, fix it before continuing.

- [ ] **Step 3: Commit**

```bash
git add VideoMemo_frontend/src/services/article.ts
git commit -m "feat(frontend): add article api client"
```

---

### Task 9: Frontend Articles Workspace

**Files:**
- Create: `VideoMemo_frontend/src/pages/Articles/index.tsx`

- [ ] **Step 1: Create article workspace page**

Create `VideoMemo_frontend/src/pages/Articles/index.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { BookOpenText, RefreshCw, Rss, Search, Send, Sparkles } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  createArticleSubscription,
  generateArticle,
  listArticleItems,
  listArticleSubscriptions,
  refreshArticleSubscription,
  searchArticles,
  summarizeArticleItem,
  type ArticleItem,
  type ArticlePlatform,
  type ArticleSubscription,
  type ArticleSubscriptionType,
} from '@/services/article'
import { useModelStore } from '@/store/modelStore'
import { useTaskStore } from '@/store/taskStore'

const platforms: Array<{ value: ArticlePlatform; label: string }> = [
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'wechat_mp', label: '微信公众号' },
]

const types: Array<{ value: ArticleSubscriptionType; label: string }> = [
  { value: 'keyword', label: '关键字' },
  { value: 'publisher', label: '发布者' },
]

export default function ArticlesPage() {
  const { modelList, loadEnabledModels } = useModelStore()
  const { addPendingTask, setCurrentTask } = useTaskStore()
  const [platform, setPlatform] = useState<ArticlePlatform>('wechat_mp')
  const [url, setUrl] = useState('')
  const [keyword, setKeyword] = useState('')
  const [query, setQuery] = useState('')
  const [subscriptionType, setSubscriptionType] = useState<ArticleSubscriptionType>('keyword')
  const [style, setStyle] = useState('minimal')
  const [extras, setExtras] = useState('')
  const [items, setItems] = useState<ArticleItem[]>([])
  const [subscriptions, setSubscriptions] = useState<ArticleSubscription[]>([])
  const [busy, setBusy] = useState(false)
  const model = modelList[0]

  useEffect(() => {
    loadEnabledModels()
    listArticleSubscriptions().then(setSubscriptions).catch(() => setSubscriptions([]))
    listArticleItems().then(setItems).catch(() => setItems([]))
  }, [loadEnabledModels])

  const providerId = useMemo(() => model?.provider_id || model?.providerId || '', [model])
  const modelName = model?.model_name || ''

  const submitDirect = async () => {
    if (!url.trim()) return toast.error('请输入文章链接')
    if (!providerId || !modelName) return toast.error('请先配置可用模型')
    setBusy(true)
    try {
      const data = await generateArticle({
        url: url.trim(),
        platform,
        provider_id: providerId,
        model_name: modelName,
        style,
        extras,
      })
      addPendingTask(data.task_id, platform, {
        video_url: url,
        platform,
        model_name: modelName,
        provider_id: providerId,
        style,
        extras,
      } as any)
      setCurrentTask(data.task_id)
      toast.success('文章总结任务已提交')
    } finally {
      setBusy(false)
    }
  }

  const submitSearch = async () => {
    if (!keyword.trim()) return toast.error('请输入关键字')
    setBusy(true)
    try {
      const data = await searchArticles({ platform, keyword: keyword.trim(), limit: 20 })
      setItems(data.items)
      toast.success(`找到 ${data.items.length} 篇文章`)
    } finally {
      setBusy(false)
    }
  }

  const submitSubscription = async () => {
    if (!query.trim()) return toast.error('请输入订阅内容')
    const created = await createArticleSubscription({
      platform,
      type: subscriptionType,
      query: query.trim(),
      label: query.trim(),
    })
    setSubscriptions([created, ...subscriptions])
    toast.success('订阅已创建')
  }

  const refreshSubscription = async (subscription: ArticleSubscription) => {
    setBusy(true)
    try {
      const data = await refreshArticleSubscription(subscription.id)
      setItems(data.items)
      toast.success(`刷新到 ${data.count} 篇文章`)
    } finally {
      setBusy(false)
    }
  }

  const summarizeItem = async (item: ArticleItem) => {
    if (!providerId || !modelName) return toast.error('请先配置可用模型')
    const data = await summarizeArticleItem(item.id, {
      provider_id: providerId,
      model_name: modelName,
      style,
      extras,
    })
    addPendingTask(data.task_id, item.platform, {
      video_url: item.url,
      platform: item.platform,
      model_name: modelName,
      provider_id: providerId,
      style,
      extras,
    } as any)
    setCurrentTask(data.task_id)
    toast.success('文章总结任务已提交')
  }

  return (
    <div className="vm-page-pad">
      <div className="vm-panel" style={{ padding: 18 }}>
        <div className="vm-section-title">
          <BookOpenText size={18} />
          <span>文章总结</span>
        </div>
        <div className="grid gap-3 md:grid-cols-[180px_1fr_auto]">
          <select className="vm-input" value={platform} onChange={e => setPlatform(e.target.value as ArticlePlatform)}>
            {platforms.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="粘贴小红书图文或微信公众号文章链接" />
          <Button disabled={busy} onClick={submitDirect}>
            <Send size={16} />
            生成总结
          </Button>
        </div>
        <Textarea className="mt-3" value={extras} onChange={e => setExtras(e.target.value)} placeholder="额外要求，可选" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="vm-panel" style={{ padding: 18 }}>
          <div className="vm-section-title">
            <Search size={18} />
            <span>关键字查询</span>
          </div>
          <div className="flex gap-2">
            <Input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="输入关键字" />
            <Button disabled={busy} onClick={submitSearch}>查询</Button>
          </div>
        </div>

        <div className="vm-panel" style={{ padding: 18 }}>
          <div className="vm-section-title">
            <Rss size={18} />
            <span>订阅</span>
          </div>
          <div className="grid gap-2 md:grid-cols-[120px_1fr_auto]">
            <select className="vm-input" value={subscriptionType} onChange={e => setSubscriptionType(e.target.value as ArticleSubscriptionType)}>
              {types.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="关键字、作者名、公众号名或主页链接" />
            <Button onClick={submitSubscription}>
              <Sparkles size={16} />
              保存
            </Button>
          </div>
          <div className="mt-3 space-y-2">
            {subscriptions.map(subscription => (
              <div key={subscription.id} className="vm-row">
                <span>{subscription.label || subscription.query}</span>
                <span className="vm-faint">{subscription.type === 'keyword' ? '关键字' : '发布者'}</span>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => refreshSubscription(subscription)}>
                  <RefreshCw size={14} />
                  刷新
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="vm-panel mt-4" style={{ padding: 18 }}>
        <div className="vm-section-title">发现的文章</div>
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="vm-row">
              <div style={{ minWidth: 0 }}>
                <div className="truncate font-medium">{item.title}</div>
                <div className="vm-faint truncate">{item.author_name || item.platform}</div>
              </div>
              <Button variant="outline" size="sm" onClick={() => window.open(item.url, '_blank')}>原文</Button>
              <Button size="sm" onClick={() => summarizeItem(item)}>总结</Button>
            </div>
          ))}
          {!items.length && <div className="vm-empty">暂无文章，试试关键字查询或刷新订阅。</div>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd VideoMemo_frontend
pnpm build
```

Expected: PASS or fail only on pre-existing unrelated errors. Fix any new TypeScript errors from this page.

- [ ] **Step 3: Commit**

```bash
git add VideoMemo_frontend/src/pages/Articles/index.tsx
git commit -m "feat(frontend): add articles workspace"
```

---

### Task 10: Frontend Routing And Navigation

**Files:**
- Modify: `VideoMemo_frontend/src/App.tsx`
- Modify: `VideoMemo_frontend/src/layouts/MainLayout.tsx`
- Modify: `VideoMemo_frontend/src/i18n/redesign.ts`
- Modify: `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`

- [ ] **Step 1: Add route and navigation**

Modify `VideoMemo_frontend/src/App.tsx`:

```tsx
const Articles = lazy(() => import('@/pages/Articles'))
```

Add inside the `MainLayout` route group:

```tsx
<Route path="articles" element={<Articles />} />
```

Modify `VideoMemo_frontend/src/layouts/MainLayout.tsx`:

```tsx
import { Newspaper } from 'lucide-react'
```

Add to `mainNav` after workspace:

```tsx
{ id: 'articles', path: '/articles', icon: <Newspaper />, zhKey: 'articles' },
```

Add to `pageMeta`:

```tsx
'/articles': { titleKey: 'articles', subKey: 'articlesSub' },
```

Modify `VideoMemo_frontend/src/i18n/redesign.ts` by adding keys to `VM_STRINGS`:

```ts
articles: { zh: '文章', en: 'Articles' },
articlesSub: { zh: '抓取总结小红书与公众号文章，管理关键字和发布者订阅。', en: 'Summarize articles and manage keyword or publisher subscriptions.' },
```

Modify `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx` by adding a compact button near the source input controls:

```tsx
<button className="vm-btn vm-btn-outline vm-btn-sm" onClick={() => navigate('/articles')}>
  <Newspaper size={15} />
  文章总结
</button>
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd VideoMemo_frontend
pnpm build
```

Expected: PASS or fail only on pre-existing unrelated errors. Fix any new TypeScript errors from routing/nav changes.

- [ ] **Step 3: Commit**

```bash
git add VideoMemo_frontend/src/App.tsx VideoMemo_frontend/src/layouts/MainLayout.tsx VideoMemo_frontend/src/i18n/redesign.ts VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx
git commit -m "feat(frontend): route articles workspace"
```

---

### Task 11: End-To-End Verification

**Files:**
- No code files unless failures reveal a defect.

- [ ] **Step 1: Run backend article suite**

Run:

```bash
cd backend
pytest tests/test_article_fetchers_wechat.py tests/test_article_fetchers_xiaohongshu.py tests/test_article_dao.py tests/test_article_service.py tests/test_article_routes.py -v
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd VideoMemo_frontend
pnpm build
```

Expected: PASS.

- [ ] **Step 3: Start backend and frontend dev servers**

Run backend:

```bash
cd backend
python main.py
```

Expected: backend listens on `http://localhost:8483`.

Run frontend:

```bash
cd VideoMemo_frontend
pnpm dev
```

Expected: frontend listens on `http://localhost:3015`.

- [ ] **Step 4: Browser verification**

Open `http://localhost:3015/articles` and verify:

- Article page renders.
- Direct article form accepts platform and URL.
- Keyword search button calls `/api/articles/search`.
- Keyword subscription can be created.
- Publisher subscription can be created.
- Refresh button calls `/api/article_subscriptions/{id}/refresh`.
- Discovered article rows show summarize/open actions.

- [ ] **Step 5: Commit verification fixes**

Only if Step 4 required code changes:

```bash
git add backend/app backend/tests VideoMemo_frontend/src
git commit -m "fix(articles): complete end-to-end verification"
```

---

## Self-Review

Spec coverage:

- Direct Xiaohongshu and WeChat article crawling: Tasks 1, 2, 4, 6, 9.
- Direct summarization and note-result compatibility: Task 4.
- Keyword query: Tasks 5, 6, 9.
- Keyword subscriptions: Tasks 3, 5, 6, 9.
- Publisher subscriptions: Tasks 3, 5, 6, 9.
- Frontend workspace: Tasks 8, 9, 10.
- Tests and verification: Tasks 1 through 7 and Task 11.

Known implementation risk:

- Xiaohongshu and WeChat publisher discovery may return empty results until stable platform-specific discovery sources are added. The API and UI still support creating, refreshing, and surfacing errors/results for those subscriptions.
- Existing worktree has unrelated uncommitted files. Stage exact files listed in each task only.
