"""外部下载任务队列的读写。"""
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from app.db.engine import SessionLocal
from app.db.models.download_job import DownloadJob


def create_job(task_id: str, url: str, platform: str, want_video: bool,
               params: Dict[str, Any]) -> str:
    jid = uuid.uuid4().hex
    with SessionLocal() as db:
        db.add(DownloadJob(
            id=jid, task_id=task_id, url=url, platform=platform,
            want_video=want_video, params=params, status="pending",
        ))
        db.commit()
    return jid


def claim_next() -> Optional[Dict[str, Any]]:
    """认领最早的一个 pending 任务，标记 claimed 并返回其信息；没有则 None。

    个人部署通常只有一个 worker，简单的 select-then-update 足够。
    """
    with SessionLocal() as db:
        job = (db.query(DownloadJob)
                 .filter(DownloadJob.status == "pending")
                 .order_by(DownloadJob.created_at.asc())
                 .first())
        if job is None:
            return None
        data = {
            "job_id": job.id,
            "task_id": job.task_id,
            "url": job.url,
            "want_video": bool(job.want_video),
        }
        job.status = "claimed"
        job.claimed_at = datetime.now()
        db.commit()
        return data


def get_job(job_id: str) -> Optional[Dict[str, Any]]:
    with SessionLocal() as db:
        job = db.get(DownloadJob, job_id)
        if job is None:
            return None
        return {
            "id": job.id,
            "task_id": job.task_id,
            "url": job.url,
            "platform": job.platform,
            "want_video": bool(job.want_video),
            "params": job.params or {},
            "status": job.status,
        }


def complete_job(job_id: str, file_url: str) -> None:
    with SessionLocal() as db:
        job = db.get(DownloadJob, job_id)
        if job is not None:
            job.status = "done"
            job.file_url = file_url
            db.commit()


def fail_job(job_id: str, error: str) -> None:
    with SessionLocal() as db:
        job = db.get(DownloadJob, job_id)
        if job is not None:
            job.status = "failed"
            job.error = (error or "")[:1000]
            db.commit()
