# app/routers/note.py
import json
import os
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, BackgroundTasks, UploadFile, File
from pydantic import BaseModel, validator, field_validator
from dataclasses import asdict

from app.db.note_dao import save_note, load_note, get_status
from app.db.video_task_dao import get_task_by_video
from app.enmus.exception import NoteErrorEnum
from app.enmus.note_enums import DownloadQuality
from app.exceptions.note import NoteError
from app.services.note import NoteGenerator, logger
from app.services import task_control
from app.services.task_serial_executor import task_serial_executor
from app.utils.response import ResponseWrapper as R
from app.utils.url_parser import extract_video_id
from app.validators.video_url_validator import is_supported_video_url
from fastapi import APIRouter, Request, HTTPException
from fastapi.responses import StreamingResponse, FileResponse, Response
import httpx
from app.enmus.task_status_enums import TaskStatus

# from app.services.downloader import download_raw_audio
# from app.services.whisperer import transcribe_audio

router = APIRouter()


class RecordRequest(BaseModel):
    video_id: str
    platform: str


class VideoRequest(BaseModel):
    video_url: str
    platform: str
    quality: DownloadQuality
    screenshot: Optional[bool] = False
    link: Optional[bool] = False
    model_name: str
    provider_id: str
    task_id: Optional[str] = None
    format: Optional[list] = []
    style: str = None
    extras: Optional[str]=None
    video_understanding: Optional[bool] = False
    video_interval: Optional[int] = 0
    grid_size: Optional[list] = []
    # 客户端（如浏览器插件）已经在用户浏览器里抓到字幕，直接传给后端复用，
    # 跳过 download_subtitles 和音频转写。形如：
    #   {"language": "zh", "full_text": "...", "segments": [{"start","end","text"}, ...]}
    prefetched_transcript: Optional[dict] = None

    @field_validator("video_url")
    def validate_supported_url(cls, v):
        url = str(v)
        parsed = urlparse(url)
        if parsed.scheme in ("http", "https"):
            # 是网络链接，继续用原有平台校验
            if not is_supported_video_url(url):
                raise NoteError(code=NoteErrorEnum.PLATFORM_NOT_SUPPORTED.code,
                                message=NoteErrorEnum.PLATFORM_NOT_SUPPORTED.message)

        return v


NOTE_OUTPUT_DIR = os.getenv("NOTE_OUTPUT_DIR", "note_results")
UPLOAD_DIR = "uploads"


def save_note_to_file(task_id: str, note):
    # 笔记正文持久化到数据库 notes 表（原先写 note_results/{task_id}.json）。
    save_note(task_id, asdict(note))


def _persist_prefetched_transcript(task_id: str, transcript: dict) -> None:
    """把客户端预取的字幕写到 NoteGenerator 期望的转写缓存文件里。

    NoteGenerator.generate 会优先读 <task_id>_transcript.json，命中即跳过 download_subtitles
    与音频转写流程。要求字段：language(可空)/full_text/segments[{start,end,text}]
    """
    segments = transcript.get("segments") or []
    cleaned_segments = []
    for s in segments:
        text = (s.get("text") or "").strip()
        if not text:
            continue
        cleaned_segments.append({
            "start": float(s.get("start", 0)),
            "end": float(s.get("end", 0)),
            "text": text,
        })
    if not cleaned_segments:
        raise ValueError("prefetched_transcript 没有可用的 segments")

    full_text = transcript.get("full_text") or " ".join(s["text"] for s in cleaned_segments)
    payload = {
        "language": transcript.get("language") or "zh",
        "full_text": full_text,
        "segments": cleaned_segments,
    }

    os.makedirs(NOTE_OUTPUT_DIR, exist_ok=True)
    target = os.path.join(NOTE_OUTPUT_DIR, f"{task_id}_transcript.json")
    with open(target, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    logger.info(f"已写入客户端预取字幕缓存: {target} ({len(cleaned_segments)} 段)")


def run_note_task(task_id: str, video_url: str, platform: str, quality: DownloadQuality,
                  link: bool = False, screenshot: bool = False, model_name: str = None, provider_id: str = None,
                  _format: list = None, style: str = None, extras: str = None, video_understanding: bool = False,
                  video_interval=0, grid_size=[]
                  ):

    if not model_name or not provider_id:
        raise HTTPException(status_code=400, detail="请选择模型和提供者")

    def _execute_note_task():
        return NoteGenerator().generate(
            video_url=video_url,
            platform=platform,
            quality=quality,
            task_id=task_id,
            model_name=model_name,
            provider_id=provider_id,
            link=link,
            _format=_format,
            style=style,
            extras=extras,
            screenshot=screenshot,
            video_understanding=video_understanding,
            video_interval=video_interval,
            grid_size=grid_size,
        )

    logger.info(f"任务进入执行队列 (task_id={task_id})")
    note = task_serial_executor.run(_execute_note_task)
    logger.info(f"Note generated: {task_id}")
    if not note or not note.markdown:
        logger.warning(f"任务 {task_id} 执行失败，跳过保存")
        return
    save_note_to_file(task_id, note)

    # 自动建立向量索引（用于 AI 问答），失败不影响笔记生成
    try:
        from app.services.vector_store import VectorStoreManager
        VectorStoreManager().index_task(task_id)
    except Exception as e:
        logger.warning(f"向量索引失败（不影响笔记）: {e}")

    # 生成后自动推送到飞书文档（仅在「设置 → 飞书推送」开启了自动推送时触发），
    # 内部已吞掉自身异常，这里再兜一层防止 import 失败影响主流程
    try:
        from app.routers.feishu import auto_push_if_enabled
        auto_push_if_enabled(task_id)
    except Exception as e:
        logger.warning(f"飞书自动推送调度失败（不影响笔记）: {e}")


@router.post('/delete_task')
def delete_task(data: RecordRequest):
    try:
        # TODO: 待持久化完成
        # NoteGenerator().delete_note(video_id=data.video_id, platform=data.platform)
        return R.success(msg='删除成功')
    except Exception as e:
        return R.error(msg=e)


def _safe_filename(name: str, fallback: str = "note") -> str:
    """剔除文件名里 OS 不允许的字符，长度截到 80。"""
    import re as _re
    cleaned = _re.sub(r'[\\/:*?"<>|\r\n\t]', "", (name or "").strip())
    cleaned = cleaned.strip(". ")
    return (cleaned[:80] or fallback)


def _normalize_versions(markdown_field, fallback_meta: Optional[dict] = None) -> list:
    """把 markdown 字段统一成版本数组形式。
    - str：包成一个 source='generated' 的版本（旧笔记自动迁移）
    - list：直接返回（已经是多版本）
    - 其它：空数组
    """
    if isinstance(markdown_field, list):
        return markdown_field
    if isinstance(markdown_field, str) and markdown_field.strip():
        meta = fallback_meta or {}
        return [{
            "ver_id": "v1",
            "content": markdown_field,
            "style": meta.get("style", ""),
            "model_name": meta.get("model_name", ""),
            "source": "generated",
            "created_at": meta.get("created_at", ""),
        }]
    return []


def _pick_markdown_version(markdown_field, version_id: Optional[str]) -> str:
    """从笔记的 markdown 字段里挑出对应版本的字符串内容。
    向后兼容旧格式（markdown 是 str）与新多版本格式（list[VersionNote]）。
    """
    versions = _normalize_versions(markdown_field)
    if not versions:
        return ""
    if version_id:
        for v in versions:
            if v.get("ver_id") == version_id:
                return v.get("content") or v.get("markdown") or ""
    # 默认取最新一版（按 created_at 排序，缺省取末尾）
    try:
        latest = sorted(
            versions,
            key=lambda v: v.get("created_at") or "",
            reverse=True,
        )[0]
    except Exception:
        latest = versions[-1]
    return latest.get("content") or latest.get("markdown") or ""


def _read_note_json(task_id: str) -> dict:
    """读笔记，把 markdown 字段就地归一化成版本数组。不存在抛 HTTPException。"""
    data = load_note(task_id)
    if data is None:
        raise HTTPException(status_code=404, detail="笔记不存在")
    data["markdown"] = _normalize_versions(data.get("markdown"))
    return data


def _write_note_json(task_id: str, data: dict) -> None:
    """写回笔记到数据库 notes 表。markdown 一定是 list 形式。"""
    save_note(task_id, data)


def _append_version(
    versions: list,
    content: str,
    source: str,
    model_name: str = "",
    style: str = "",
) -> dict:
    """构造一个新版本并 append 到 versions，返回新版本的 dict（含 ver_id）。"""
    from datetime import datetime
    new_ver = {
        "ver_id": uuid.uuid4().hex[:12],
        "content": content,
        "style": style or "",
        "model_name": model_name or "",
        "source": source,  # 'generated' | 'manual' | 'repolish'
        "created_at": datetime.now().isoformat(timespec="seconds"),
    }
    versions.append(new_ver)
    return new_ver


def _trigger_reindex(task_id: str, background_tasks: BackgroundTasks) -> None:
    """编辑/润色/删版本后异步重建向量索引，避免知识检索查到旧内容。失败不影响主流程。"""
    def _do():
        try:
            from app.services.vector_store import VectorStoreManager
            VectorStoreManager().index_task(task_id)
        except Exception as e:
            logger.warning(f"重建向量索引失败 task_id={task_id}: {e}")
    background_tasks.add_task(_do)


@router.get("/export_note/{task_id}")
def export_note(task_id: str, format: str = "markdown", version_id: Optional[str] = None):
    """
    导出指定笔记为多种格式。
    - format: markdown / pdf / html / word / docx（image / png 暂不支持）
    - version_id: 多版本时指定某一版；不传取最新版（v1 单版兼容旧 str 格式）
    """
    note = load_note(task_id)
    if note is None:
        raise HTTPException(status_code=404, detail="笔记不存在")

    content = _pick_markdown_version(note.get("markdown"), version_id)
    if not content.strip():
        raise HTTPException(status_code=404, detail="笔记内容为空")

    audio_meta = note.get("audio_meta", {}) or {}
    raw_title = audio_meta.get("title") or (audio_meta.get("raw_info") or {}).get("title") or task_id
    title = _safe_filename(raw_title, fallback=task_id)

    fmt = format.lower().strip()
    if fmt == "markdown" or fmt == "md":
        # 直接返回 Markdown 文本，让浏览器另存。中文文件名按 RFC 5987 编码，
        # 否则 Chrome / Safari 会丢掉非 ASCII 的 filename。
        from urllib.parse import quote
        ascii_fallback = f"{task_id}.md"
        cd = (
            f"attachment; filename=\"{ascii_fallback}\"; "
            f"filename*=UTF-8''{quote(title + '.md', safe='')}"
        )
        return Response(
            content=content,
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": cd},
        )

    # 其它格式落到 ExportUtils（pdf / html / word / docx）
    try:
        from app.utils.export import ExportUtils
        save_path = ExportUtils().export(fmt, title=title, content=content)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"导出失败 task_id={task_id} format={fmt}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出失败: {e}")

    if not os.path.exists(save_path):
        raise HTTPException(status_code=500, detail="导出文件未生成")

    media_map = {
        "pdf": "application/pdf",
        "html": "text/html; charset=utf-8",
        "word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    return FileResponse(
        path=save_path,
        media_type=media_map.get(fmt, "application/octet-stream"),
        filename=os.path.basename(save_path),
    )


# ── 笔记多版本：手动编辑 / AI 重新润色 / 删版本 ─────────────────


class ManualEditRequest(BaseModel):
    content: str
    style: Optional[str] = None  # 沿用上一版风格，不传也行


class RepolishRequest(BaseModel):
    style: Optional[str] = None
    extras: Optional[str] = None
    provider_id: str
    model_name: str


def _versions_response_payload(task_id: str, data: dict, new_version: Optional[dict] = None) -> dict:
    """统一的响应负载：把整篇笔记 + 新版本 id 返回给前端，前端可直接刷整页状态。"""
    return {
        "task_id": task_id,
        "markdown": data["markdown"],  # 已被归一化成 list
        "current_ver_id": new_version["ver_id"] if new_version else None,
    }


@router.patch("/note/{task_id}")
def update_note(task_id: str, body: ManualEditRequest, background_tasks: BackgroundTasks):
    """手动编辑笔记 —— 把当前编辑的内容作为新版本追加到 markdown 数组。"""
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="笔记内容不能为空")
    data = _read_note_json(task_id)
    versions = data["markdown"]  # 已 normalize

    # 沿用最新版本的 model_name + style 作默认值（保持元数据一致性）
    last = versions[-1] if versions else {}
    new_ver = _append_version(
        versions,
        content=body.content,
        source="manual",
        model_name=last.get("model_name", ""),
        style=body.style or last.get("style", ""),
    )
    data["markdown"] = versions
    _write_note_json(task_id, data)
    _trigger_reindex(task_id, background_tasks)
    return R.success(data=_versions_response_payload(task_id, data, new_ver))


@router.post("/note/{task_id}/repolish")
def repolish_note(task_id: str, body: RepolishRequest, background_tasks: BackgroundTasks):
    """AI 重新润色 —— 用现有 markdown + transcript 调 LLM 生成新风格，作为新版本追加。"""
    try:
        new_content = NoteGenerator().repolish(
            task_id=task_id,
            style=body.style,
            extras=body.extras,
            provider_id=body.provider_id,
            model_name=body.model_name,
        )
    except NoteError as e:
        raise HTTPException(status_code=400, detail=e.message)
    except Exception as e:
        logger.error(f"重新润色失败 task_id={task_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"重新润色失败: {e}")

    if not new_content or not new_content.strip():
        raise HTTPException(status_code=500, detail="模型未返回内容")

    data = _read_note_json(task_id)
    versions = data["markdown"]
    new_ver = _append_version(
        versions,
        content=new_content,
        source="repolish",
        model_name=body.model_name,
        style=body.style or "",
    )
    data["markdown"] = versions
    _write_note_json(task_id, data)
    _trigger_reindex(task_id, background_tasks)
    return R.success(data=_versions_response_payload(task_id, data, new_ver))


@router.delete("/note/{task_id}/version/{ver_id}")
def delete_version(task_id: str, ver_id: str, background_tasks: BackgroundTasks):
    """删除某个版本。至少保留一个版本，否则拒绝。"""
    data = _read_note_json(task_id)
    versions = data["markdown"]
    if len(versions) <= 1:
        raise HTTPException(status_code=400, detail="至少需要保留一个版本")

    new_versions = [v for v in versions if v.get("ver_id") != ver_id]
    if len(new_versions) == len(versions):
        raise HTTPException(status_code=404, detail=f"版本不存在：{ver_id}")

    data["markdown"] = new_versions
    _write_note_json(task_id, data)
    _trigger_reindex(task_id, background_tasks)
    return R.success(data=_versions_response_payload(task_id, data, new_versions[-1]))


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    file_location = os.path.join(UPLOAD_DIR, file.filename)

    with open(file_location, "wb+") as f:
        f.write(await file.read())

    # 假设你静态目录挂载了 /uploads
    return R.success({"url": f"/uploads/{file.filename}"})


@router.post("/generate_note")
def generate_note(data: VideoRequest, background_tasks: BackgroundTasks):
    try:
        # 就绪门禁：本地转写引擎（fast-whisper / mlx-whisper）必须等模型下载完才能跑视频，
        # 否则任务会卡在首次下载（慢 / OOM / 截断），用户只看到一个静默失败的任务。
        # 客户端已抓好字幕（prefetched_transcript）则不需要转写，跳过检查。
        if not data.prefetched_transcript:
            from app.services.transcriber_config_manager import TranscriberConfigManager
            readiness = TranscriberConfigManager().is_model_ready()
            if not readiness["ready"]:
                logger.warning(f"拒绝 generate_note：{readiness['reason']}")
                return R.error(
                    msg=readiness["reason"],
                    code=300102,
                    data={
                        "reason": "transcriber_model_not_ready",
                        "transcriber_type": readiness["transcriber_type"],
                        "model_size": readiness["model_size"],
                        "downloading": readiness["downloading"],
                    },
                )

        video_id = extract_video_id(data.video_url, data.platform)
        # if not video_id:
        #     raise HTTPException(status_code=400, detail="无法提取视频 ID")
        # existing = get_task_by_video(video_id, data.platform)
        # if existing:
        #     return R.error(
        #         msg='笔记已生成，请勿重复发起',
        #
        #     )
        if data.task_id:
            # 如果传了task_id，说明是重试！
            task_id = data.task_id
            logger.info(f"重试模式，复用已有 task_id={task_id}")
        else:
            # 正常新建任务
            task_id = str(uuid.uuid4())

        # 统一先写入 PENDING，表示已进入队列等待串行执行
        NoteGenerator()._update_status(task_id, TaskStatus.PENDING)

        # 客户端已经抓好字幕的话，写到转写缓存文件，NoteGenerator 的 cache-hit 逻辑会直接用上
        if data.prefetched_transcript:
            try:
                _persist_prefetched_transcript(task_id, data.prefetched_transcript)
            except Exception as e:
                logger.warning(f"写入预取字幕失败 (task_id={task_id}): {e}")

        background_tasks.add_task(run_note_task, task_id, data.video_url, data.platform, data.quality, data.link,
                                  data.screenshot, data.model_name, data.provider_id, data.format, data.style,
                                  data.extras, data.video_understanding, data.video_interval, data.grid_size)
        return R.success({"task_id": task_id})
    except Exception as e:
        # 用业务错误格式返回（而不是 HTTPException 500）：
        # 前端拦截器读的是 msg 字段，500 的 detail 会被吞成笼统的「服务器错误，请稍后再试」，
        # 用户看不到「转写引擎不可用，请安装/切换」这类可行动的原因。
        logger.error(f"generate_note 入口失败: {e}", exc_info=True)
        return R.error(msg=str(e))


@router.get("/task_status/{task_id}")
def get_task_status(task_id: str):
    # 状态与结果都从数据库 notes 表读（原先读 {task_id}.status.json / {task_id}.json）
    status_content = get_status(task_id)
    result_content = load_note(task_id)

    # 优先读状态
    if status_content:
        status = status_content.get("status")
        message = status_content.get("message", "")
        paused = bool(status_content.get("paused", False))
        cache = status_content.get("cache")

        if status == TaskStatus.SUCCESS.value:
            # 成功状态的话，继续读取最终笔记内容
            if result_content is not None:
                return R.success({
                    "status": status,
                    "result": result_content,
                    "message": message,
                    "cache": cache,
                    "task_id": task_id
                })
            else:
                # 理论上不会出现，保险处理
                return R.success({
                    "status": TaskStatus.PENDING.value,
                    "message": "任务完成，但结果文件未找到",
                    "cache": cache,
                    "task_id": task_id
                })

        if status == TaskStatus.FAILED.value:
            return R.error(message or "任务失败", code=500)

        # 处理中状态
        return R.success({
            "status": status,
            "message": message,
            "paused": paused,
            "cache": cache,
            "task_id": task_id
        })

    # 没有状态，但有结果
    if result_content is not None:
        return R.success({
            "status": TaskStatus.SUCCESS.value,
            "result": result_content,
            "task_id": task_id
        })

    # 什么都没有，默认PENDING
    return R.success({
        "status": TaskStatus.PENDING.value,
        "message": "任务排队中",
        "task_id": task_id
    })


class TaskControlRequest(BaseModel):
    task_id: str
    action: str  # 'pause' | 'resume'


@router.post("/task_control")
def task_control_endpoint(data: TaskControlRequest):
    """暂停 / 继续任务。暂停仅在步骤之间生效（总结阶段之后不可暂停）。"""
    if data.action == "pause":
        task_control.pause(data.task_id)
        return R.success(msg="已请求暂停")
    if data.action == "resume":
        task_control.resume(data.task_id)
        return R.success(msg="已继续")
    return R.error(msg="无效的操作")


# Referer 选择逻辑移到 cover_helper 统一维护（image_proxy 与笔记生成时的封面本地化共用）
from app.utils.cover_helper import pick_referer as _pick_referer


@router.get("/image_proxy")
async def image_proxy(request: Request, url: str):
    headers = {
        "User-Agent": request.headers.get(
            "User-Agent",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        ),
    }
    referer = _pick_referer(url)
    if referer:
        headers["Referer"] = referer

    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)

            if resp.status_code != 200:
                raise HTTPException(status_code=resp.status_code, detail="图片获取失败")

            content_type = resp.headers.get("Content-Type", "image/jpeg")
            return StreamingResponse(
                resp.aiter_bytes(),
                media_type=content_type,
                headers={
                    "Cache-Control": "public, max-age=86400",  #  缓存一天
                    "Content-Type": content_type,
                }
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
