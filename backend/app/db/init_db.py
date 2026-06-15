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
    _ensure_model_provider_id_text(engine)


# 注：原 _ensure_model_columns 为 models.supports_multimodal 做的迁移已删除——
# 该列在「drop multimodal」重构后已不再被 ORM 使用（纯遗留），且它的
# `ALTER ... BOOLEAN NOT NULL DEFAULT 0` 在 Postgres 上会因 boolean 默认值类型不符直接报错。
# 已有 SQLite 库里残留的该列无害，保持不动即可。


def _ensure_model_provider_id_text(engine):
    # 早期 Postgres 部署里 models.provider_id 被建成 INTEGER（ORM 旧定义），
    # 但实际存的是字符串 provider id（如 "deepseek"），导致查询报
    # invalid input syntax for type integer。这里把已有的整型列就地改成 VARCHAR。
    # 仅 Postgres 需要；SQLite 动态类型无此问题。幂等（改完后类型名不含 INT 即跳过）。
    if engine.dialect.name != "postgresql":
        return
    inspector = inspect(engine)
    if "models" not in inspector.get_table_names():
        return
    for column in inspector.get_columns("models"):
        if column["name"] != "provider_id":
            continue
        if "INT" in str(column["type"]).upper():
            with engine.begin() as conn:
                conn.execute(text(
                    "ALTER TABLE models ALTER COLUMN provider_id TYPE VARCHAR "
                    "USING provider_id::varchar"
                ))
        break


def _ensure_article_content_text(engine):
    inspector = inspect(engine)
    if "article_items" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("article_items")}
    if "content_text" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE article_items ADD COLUMN content_text TEXT NOT NULL DEFAULT ''"))
