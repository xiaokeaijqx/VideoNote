from sqlalchemy import Column, String, JSON, DateTime, func

from app.db.engine import Base


class Note(Base):
    """笔记正文与任务状态：原先是 note_results/{task_id}.json 和
    {task_id}.status.json 两个本地文件，迁进数据库后重启不丢。

    - content: 笔记结果整体（markdown 版本数组 / transcript / audio_meta 等），
               对应旧的 {task_id}.json。
    - status:  任务状态字典 {status, paused, message?, cache?}，
               对应旧的 {task_id}.status.json。
    两者各自独立 upsert，互不覆盖（状态机先写 status，生成完才写 content）。
    转写/音频缓存、_markdown.md、截图等可重建数据仍留在磁盘，不入库。
    """

    __tablename__ = "notes"

    task_id = Column(String, primary_key=True)
    content = Column(JSON, nullable=True)
    status = Column(JSON, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
