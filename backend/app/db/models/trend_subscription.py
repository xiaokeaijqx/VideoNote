from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text, func

from app.db.engine import Base


class TrendSubscription(Base):
    __tablename__ = "trend_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    keywords = Column(Text, nullable=False, default="[]")  # JSON array of keyword strings
    platforms = Column(Text, nullable=False, default='["all"]')  # JSON array of platform ids
    match_mode = Column(String, nullable=False, default="any")  # "any" | "all"
    enabled = Column(Boolean, nullable=False, default=True)
    push_enabled = Column(Boolean, nullable=False, default=False)
    push_channel_ids = Column(Text, nullable=False, default="[]")  # JSON array of channel ids
    last_matched_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TrendSubscriptionMatch(Base):
    __tablename__ = "trend_subscription_matches"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subscription_id = Column(Integer, ForeignKey("trend_subscriptions.id"), nullable=False)
    platform = Column(String, nullable=False)
    item_id = Column(String, nullable=False)
    title = Column(String, nullable=False)
    url = Column(Text, nullable=False, default="")
    hot_score = Column(String, nullable=False, default="")
    matched_keywords = Column(Text, nullable=False, default="[]")  # JSON array of matched keywords
    matched_at = Column(DateTime, server_default=func.now())
    is_read = Column(Boolean, nullable=False, default=False)
    # dedup: same subscription + same platform + same item_id
    __table_args__ = (
        {"sqlite_autoincrement": True},
    )


class NotificationChannel(Base):
    __tablename__ = "notification_channels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False)
    type = Column(String, nullable=False)  # "webhook" | "bark" | "email"
    config = Column(Text, nullable=False, default="{}")  # JSON object, type-specific
    enabled = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
