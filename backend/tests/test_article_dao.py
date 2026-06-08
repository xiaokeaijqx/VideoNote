import importlib

from app.article_fetchers.base import ArticleContent


def _load_article_dao(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'articles.db'}")
    import app.db.engine as engine
    import app.db.models.articles as article_models
    import app.db.init_db as init_db

    importlib.reload(engine)
    importlib.reload(article_models)
    importlib.reload(init_db)
    init_db.init_db()

    import app.db.article_dao as article_dao

    return importlib.reload(article_dao)


def test_upsert_article_item_dedupes_by_platform_and_article_id(tmp_path, monkeypatch):
    article_dao = _load_article_dao(tmp_path, monkeypatch)
    article = ArticleContent(
        platform="wechat_mp",
        url="https://mp.weixin.qq.com/s/a",
        article_id="biz:mid:1:sn",
        title="标题",
        author_name="公众号",
        content_text="正文",
    )

    first = article_dao.upsert_article_item(article)
    second = article_dao.upsert_article_item(article)

    assert first.id == second.id
    assert len(article_dao.list_article_items()) == 1


def test_create_subscription_and_link_item(tmp_path, monkeypatch):
    article_dao = _load_article_dao(tmp_path, monkeypatch)
    article = article_dao.upsert_article_item(
        ArticleContent(
            platform="xiaohongshu",
            url="https://www.xiaohongshu.com/explore/a",
            article_id="a",
            title="小红书标题",
            content_text="正文",
        )
    )

    subscription = article_dao.create_subscription(
        platform="xiaohongshu",
        subscription_type="keyword",
        query="AI",
        label="AI",
    )
    article_dao.link_subscription_item(subscription.id, article.id, "keyword:AI")

    assert article_dao.list_subscriptions()[0].query == "AI"
    assert article_dao.get_article_item(article.id).title == "小红书标题"
    assert article_dao.list_article_items(subscription_id=subscription.id)[0].id == article.id
