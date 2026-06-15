import glob
import json
import os

from app.db.models.app_config import AppConfig
from app.db.models.articles import ArticleItem, ArticleSubscription, ArticleSubscriptionItem
from app.db.models.download_job import DownloadJob
from app.db.models.models import Model
from app.db.models.note import Note
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
    _import_legacy_notes(engine)


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


def _import_legacy_notes(engine):
    # 一次性导入：把旧的 note_results/{task_id}.json（+ {task_id}.status.json）迁进 notes 表。
    # 仅当 notes 表为空时执行，幂等；HF 临时盘上目录为空时直接跳过。失败不影响启动。
    from app.db.note_dao import save_note, set_status

    note_dir = os.getenv("NOTE_OUTPUT_DIR", "note_results")
    if not os.path.isdir(note_dir):
        return
    try:
        with engine.connect() as conn:
            count = conn.execute(text("SELECT COUNT(*) FROM notes")).scalar()
        if count and int(count) > 0:
            return
    except Exception:
        return

    imported = 0
    for path in glob.glob(os.path.join(note_dir, "*.json")):
        name = os.path.basename(path)
        stem = name[:-5]  # 去掉 .json
        # 跳过缓存/状态/检查点：转写、音频缓存、{id}.status、{key}.gpt.checkpoint 等。
        # 正经笔记的 task_id 是 UUID（不含点），据此排除带点的派生文件。
        if stem.endswith("_transcript") or stem.endswith("_audio") or "." in stem:
            continue
        try:
            content = json.loads(open(path, "r", encoding="utf-8").read())
        except Exception:
            continue
        save_note(stem, content)
        status_path = os.path.join(note_dir, f"{stem}.status.json")
        if os.path.exists(status_path):
            try:
                set_status(stem, json.loads(open(status_path, "r", encoding="utf-8").read()))
            except Exception:
                pass
        imported += 1
    if imported:
        print(f"[init_db] 已从本地文件导入 {imported} 篇历史笔记到数据库")


def _ensure_article_content_text(engine):
    inspector = inspect(engine)
    if "article_items" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("article_items")}
    if "content_text" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE article_items ADD COLUMN content_text TEXT NOT NULL DEFAULT ''"))
