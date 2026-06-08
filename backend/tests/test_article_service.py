import importlib
import json

from app.article_fetchers.base import ArticleContent


def _load_article_service(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'articles.db'}")
    monkeypatch.setenv("NOTE_OUTPUT_DIR", str(tmp_path / "notes"))
    import app.db.engine as engine
    import app.db.models.articles as article_models
    import app.db.init_db as init_db

    importlib.reload(engine)
    importlib.reload(article_models)
    importlib.reload(init_db)
    init_db.init_db()

    import app.db.article_dao as article_dao
    import app.services.article as article_service

    importlib.reload(article_dao)
    return importlib.reload(article_service)


class FakeGPT:
    total_tokens = 42

    def summarize(self, source):
        text = "\n".join(segment.text for segment in source.segment)
        assert "正文内容" in text
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


def test_generate_from_url_saves_note_json(tmp_path, monkeypatch):
    article_service = _load_article_service(tmp_path, monkeypatch)
    service = article_service.ArticleService(
        fetchers={"wechat_mp": FakeFetcher()},
        gpt_factory=lambda *_: FakeGPT(),
    )

    result = service.generate_from_url(
        url="https://mp.weixin.qq.com/s/a",
        platform="wechat_mp",
        provider_id="provider",
        model_name="model",
        style="minimal",
        extras="",
        task_id="task-1",
    )

    saved = json.loads((tmp_path / "notes" / "task-1.json").read_text(encoding="utf-8"))
    status = json.loads((tmp_path / "notes" / "task-1.status.json").read_text(encoding="utf-8"))
    assert result["task_id"] == "task-1"
    assert saved["markdown"] == "# 总结\n\n- 要点"
    assert saved["transcript"]["full_text"] == "正文内容"
    assert saved["audio_meta"]["title"] == "文章标题"
    assert saved["audio_meta"]["platform"] == "wechat_mp"
    assert saved["audio_meta"]["video_id"] == "article-1"
    assert saved["total_tokens"] == 42
    assert status["status"] == "SUCCESS"


def test_search_by_keyword_persists_results(tmp_path, monkeypatch):
    article_service = _load_article_service(tmp_path, monkeypatch)
    service = article_service.ArticleService(
        fetchers={"xiaohongshu": SearchFetcher()},
        gpt_factory=lambda *_: FakeGPT(),
    )

    result = service.search(platform="xiaohongshu", keyword="AI", limit=10)

    assert result["status"] == "ok"
    assert result["items"][0]["title"] == "AI 搜索结果"
    assert len(article_service.list_article_items()) == 1


def test_refresh_keyword_subscription_links_items(tmp_path, monkeypatch):
    article_service = _load_article_service(tmp_path, monkeypatch)
    service = article_service.ArticleService(
        fetchers={"xiaohongshu": SearchFetcher()},
        gpt_factory=lambda *_: FakeGPT(),
    )
    subscription = article_service.create_subscription("xiaohongshu", "keyword", "AI", "AI")

    result = service.refresh_subscription(subscription.id)

    assert result["subscription_id"] == subscription.id
    assert result["count"] == 1
    assert article_service.list_subscriptions()[0].query == "AI"
    assert article_service.list_article_items(subscription_id=subscription.id)[0].title == "AI 搜索结果"


def test_refresh_publisher_subscription_links_items(tmp_path, monkeypatch):
    article_service = _load_article_service(tmp_path, monkeypatch)
    service = article_service.ArticleService(
        fetchers={"xiaohongshu": SearchFetcher()},
        gpt_factory=lambda *_: FakeGPT(),
    )
    subscription = article_service.create_subscription("xiaohongshu", "publisher", "作者", "作者")

    result = service.refresh_subscription(subscription.id)

    assert result["count"] == 1
    assert result["items"][0]["title"] == "作者 发布者结果"
