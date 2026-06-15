from sqlalchemy import Column, Integer, String, DateTime, func, ForeignKey

from app.db.engine import Base


class Model(Base):
    __tablename__ = "models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # provider_id 存的是 Provider.id（字符串，如 "deepseek"），必须用 String。
    # 旧版误写成 Integer，SQLite 动态类型未暴露问题，但 Postgres 严格校验会报
    # invalid input syntax for type integer: "deepseek"。见 init_db 的列类型迁移。
    provider_id = Column(String, nullable=False)
    model_name = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())