from app.db.models.articles import ArticleItem, ArticleSubscription, ArticleSubscriptionItem
from app.db.models.models import Model
from app.db.models.providers import Provider
from app.db.models.trend_subscription import (
    NotificationChannel,
    TrendSubscription,
    TrendSubscriptionMatch,
)
from app.db.models.video_tasks import VideoTask
from app.db.engine import get_engine, Base
from sqlalchemy import inspect, text

def init_db():
    engine = get_engine()

    Base.metadata.create_all(bind=engine)
    _ensure_article_content_text(engine)


# 注：原 _ensure_model_columns 为 models.supports_multimodal 做的迁移已删除——
# 该列在「drop multimodal」重构后已不再被 ORM 使用（纯遗留），且它的
# `ALTER ... BOOLEAN NOT NULL DEFAULT 0` 在 Postgres 上会因 boolean 默认值类型不符直接报错。
# 已有 SQLite 库里残留的该列无害，保持不动即可。


def _ensure_article_content_text(engine):
    inspector = inspect(engine)
    if "article_items" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("article_items")}
    if "content_text" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE article_items ADD COLUMN content_text TEXT NOT NULL DEFAULT ''"))
