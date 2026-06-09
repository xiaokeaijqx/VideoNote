from app.db.models.articles import ArticleItem, ArticleSubscription, ArticleSubscriptionItem
from app.db.models.models import Model
from app.db.models.providers import Provider
from app.db.models.video_tasks import VideoTask
from app.db.engine import get_engine, Base
from sqlalchemy import inspect, text

def init_db():
    engine = get_engine()

    Base.metadata.create_all(bind=engine)
    _ensure_model_columns(engine)


def _ensure_model_columns(engine):
    inspector = inspect(engine)
    table_names = inspector.get_table_names()
    if "models" not in table_names:
        return

    columns = {column["name"] for column in inspector.get_columns("models")}
    if "supports_multimodal" not in columns:
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE models ADD COLUMN supports_multimodal BOOLEAN NOT NULL DEFAULT 0")
            )
