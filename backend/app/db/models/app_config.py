from sqlalchemy import Column, String, JSON, DateTime, func

from app.db.engine import Base


class AppConfig(Base):
    """通用键值配置表：把原先散落在 config/*.json 的配置迁进数据库，
    让飞书凭证 / 平台 cookie / 代理 / 转写设置 / 自定义平台等重启不丢。

    - key:   配置域名（feishu / proxy / downloader / transcriber / custom_platforms）
    - value: 该域的整份配置，任意 JSON（dict 或 list）。Postgres 上是 JSONB，
             SQLite 上是 JSON 文本，由 SQLAlchemy 的 JSON 类型按方言落地。
    """

    __tablename__ = "app_config"

    key = Column(String, primary_key=True)
    value = Column(JSON, nullable=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
