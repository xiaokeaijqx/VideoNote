"""notes 表的读写：笔记正文（content）与任务状态（status）。

取代原先 note_results/{task_id}.json 与 {task_id}.status.json 两个本地文件。
content 与 status 各自独立 upsert，互不覆盖。
"""
from typing import Any, Dict, Optional

from app.db.engine import SessionLocal
from app.db.models.note import Note


def _upsert(task_id: str, **fields) -> None:
    with SessionLocal() as db:
        row = db.get(Note, task_id)
        if row is None:
            row = Note(task_id=task_id)
            db.add(row)
        for key, val in fields.items():
            setattr(row, key, val)
        db.commit()


def save_note(task_id: str, content: Dict[str, Any]) -> None:
    """写笔记正文（不动 status）。"""
    _upsert(task_id, content=content)


def load_note(task_id: str) -> Optional[Dict[str, Any]]:
    """读笔记正文；不存在返回 None。"""
    with SessionLocal() as db:
        row = db.get(Note, task_id)
        return row.content if row is not None and row.content is not None else None


def set_status(task_id: str, status_data: Dict[str, Any]) -> None:
    """写任务状态字典 {status, paused, message?, cache?}（不动 content）。"""
    _upsert(task_id, status=status_data)


def get_status(task_id: str) -> Optional[Dict[str, Any]]:
    """读任务状态；不存在返回 None。"""
    with SessionLocal() as db:
        row = db.get(Note, task_id)
        return row.status if row is not None and row.status is not None else None


def delete_note(task_id: str) -> None:
    """删除笔记行（正文 + 状态）。"""
    with SessionLocal() as db:
        row = db.get(Note, task_id)
        if row is not None:
            db.delete(row)
            db.commit()
