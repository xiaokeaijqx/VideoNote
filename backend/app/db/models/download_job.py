from sqlalchemy import Column, String, JSON, Boolean, DateTime, func

from app.db.engine import Base


class DownloadJob(Base):
    """外部下载任务队列：网页发起的某些平台（默认 YouTube）下载，交给跑在住宅 IP 上的
    家用 worker 拉取执行，绕开机房 IP 风控。

    家里 worker 轮询认领 pending 任务 → 下载 → 回传文件 → 服务器用原 task_id 跑本地管线。
    """

    __tablename__ = "download_jobs"

    id = Column(String, primary_key=True)            # job uuid
    task_id = Column(String, nullable=False)         # 关联的笔记任务（沿用它跑后续管线）
    url = Column(String, nullable=False)
    platform = Column(String, nullable=False)
    want_video = Column(Boolean, default=False)      # True=要截图→下视频；False=只下音频
    params = Column(JSON, nullable=True)             # run_note_task 的其余参数，回传后原样重放
    status = Column(String, default="pending")       # pending / claimed / done / failed
    file_url = Column(String, nullable=True)         # 回传后的 /uploads/xxx
    error = Column(String, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    claimed_at = Column(DateTime, nullable=True)
