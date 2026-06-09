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
    content_text = Column(Text, nullable=False, default="")
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
