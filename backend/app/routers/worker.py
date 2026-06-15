"""家用下载 worker 的对接接口（都在 /api 下，复用全局访问密码鉴权）。

  GET  /worker/next      worker 轮询认领一个 pending 下载任务（顺带上报心跳）
  POST /worker/complete  worker 下载完回传文件 → 服务器用原 task_id 跑本地管线
  POST /worker/fail      worker 下载失败上报 → 任务标记失败
  GET  /worker/config    查看外部下载配置（前端可选用）
  POST /worker/config    改外部下载配置（enabled / platforms）
"""
import os

from fastapi import APIRouter, BackgroundTasks, File, Form, UploadFile
from pydantic import BaseModel

from app.db import download_job_dao as jobs
from app.enmus.note_enums import DownloadQuality
from app.enmus.task_status_enums import TaskStatus
from app.services import external_download
from app.utils.response import ResponseWrapper as R

router = APIRouter()


@router.get("/worker/next")
def worker_next():
    external_download.mark_worker_seen()
    job = jobs.claim_next()
    return R.success(job or {})


@router.post("/worker/complete")
async def worker_complete(
    background_tasks: BackgroundTasks,
    job_id: str = Form(...),
    file: UploadFile = File(...),
):
    from app.routers.note import UPLOAD_DIR, run_note_task

    external_download.mark_worker_seen()
    job = jobs.get_job(job_id)
    if job is None:
        return R.error(msg="下载任务不存在", code=404)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    dest = os.path.join(UPLOAD_DIR, file.filename)
    with open(dest, "wb+") as f:
        f.write(await file.read())
    file_url = f"/uploads/{file.filename}"
    jobs.complete_job(job_id, file_url)

    # 用原 task_id 跑本地管线（platform=local），把网页发起时的参数原样重放
    p = job["params"] or {}
    try:
        quality = DownloadQuality(p.get("quality", "fast"))
    except Exception:
        quality = DownloadQuality.fast
    background_tasks.add_task(
        run_note_task,
        job["task_id"], file_url, "local", quality,
        p.get("link", False), p.get("screenshot", False),
        p.get("model_name"), p.get("provider_id"), p.get("format", []),
        p.get("style"), p.get("extras"), p.get("video_understanding", False),
        p.get("video_interval", 0), p.get("grid_size", []),
    )
    return R.success({"task_id": job["task_id"]})


class WorkerFailRequest(BaseModel):
    job_id: str
    error: str = "下载失败"


@router.post("/worker/fail")
def worker_fail(data: WorkerFailRequest):
    from app.services.note import NoteGenerator

    external_download.mark_worker_seen()
    job = jobs.get_job(data.job_id)
    jobs.fail_job(data.job_id, data.error)
    if job is not None:
        NoteGenerator()._update_status(job["task_id"], TaskStatus.FAILED, message=data.error)
    return R.success()


@router.get("/worker/config")
def get_worker_config():
    cfg = external_download.get_config()
    cfg["worker_online"] = external_download.worker_alive()
    return R.success(cfg)


class WorkerConfigRequest(BaseModel):
    enabled: bool
    platforms: list = ["youtube"]


@router.post("/worker/config")
def set_worker_config(data: WorkerConfigRequest):
    return R.success(external_download.set_config(data.enabled, data.platforms))
