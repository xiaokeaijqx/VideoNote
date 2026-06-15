from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from app.services import feishu_pusher
from app.services.feishu_config_manager import FeishuConfigManager
from app.services.feishu_service import FeishuError
from app.utils.response import ResponseWrapper as R

logger = logging.getLogger(__name__)

router = APIRouter()

# 后端对外可访问地址：用于把笔记里的 /static、/uploads 相对图片补成绝对链接，
# 让飞书导入时有机会抓到图（与 app/services/note.py 的 BACKEND_BASE_URL 同源）。
_API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost")
_BACKEND_PORT = os.getenv("BACKEND_PORT", "8483")
BACKEND_ORIGIN = f"{_API_BASE_URL}:{_BACKEND_PORT}"


class FeishuConfigRequest(BaseModel):
    app_id: Optional[str] = None
    app_secret: Optional[str] = None
    folder_token: Optional[str] = None
    base_url: Optional[str] = None
    auto_push: Optional[bool] = None
    enabled: Optional[bool] = None
    push_backend: Optional[str] = None  # "auto" | "rest" | "cli"
    cli_path: Optional[str] = None


class FeishuPushRequest(BaseModel):
    task_id: str
    version_id: Optional[str] = None


def push_task_to_feishu(task_id: str, version_id: Optional[str] = None) -> dict:
    """读取已生成笔记 → 导入飞书文档 → 把结果写回笔记 JSON，返回 feishu 信息。

    被「手动推送」接口与「生成后自动推送」共用。任何失败都抛 FeishuError，
    由调用方决定是返回错误还是仅记日志（自动推送场景不应中断主流程）。

    直接读写原始笔记内容（不走 _read/_write_note_json 的版本归一化），避免把
    markdown 字符串就地改写成版本数组、抹掉单版本笔记的 model/style 元信息。
    """
    # 延迟导入避免与 note 路由的循环依赖；note 路由不在模块级 import 本模块
    from app.routers.note import _pick_markdown_version
    from app.db.note_dao import load_note, save_note

    data = load_note(task_id)
    if data is None:
        raise FeishuError(f"笔记不存在或尚未生成完成：{task_id}")

    # _pick_markdown_version 兼容旧 str 与多版本 list 两种格式，仅读取不改写
    content = _pick_markdown_version(data.get("markdown"), version_id)
    if not (content or "").strip():
        raise FeishuError("笔记内容为空，无法推送到飞书")

    audio_meta = data.get("audio_meta") or {}
    raw_info = audio_meta.get("raw_info") or {}
    title = audio_meta.get("title") or raw_info.get("title") or f"VideoMemo 笔记 {task_id[:8]}"

    result = feishu_pusher.push_markdown(
        title=title,
        markdown=content,
        image_base_url=BACKEND_ORIGIN,
    )
    feishu_info = {
        "url": result.get("url", ""),
        "token": result.get("token", ""),
        "type": result.get("type", "docx"),
        "title": result.get("title", title),
        "pushed_at": datetime.now().isoformat(timespec="seconds"),
    }
    data["feishu"] = feishu_info
    save_note(task_id, data)
    return feishu_info


def auto_push_if_enabled(task_id: str) -> None:
    """笔记生成成功后调用：开启「自动推送」时把笔记推到飞书。失败只记日志，不影响主流程。"""
    try:
        if not FeishuConfigManager().is_auto_push_enabled():
            return
        info = push_task_to_feishu(task_id)
        logger.info(f"飞书自动推送成功 (task_id={task_id}) -> {info.get('url')}")
    except Exception as e:
        logger.warning(f"飞书自动推送失败 (task_id={task_id})：{e}")


# ─── 配置 ────────────────────────────────────────────────────────────────────
@router.get("/feishu_config")
def get_feishu_config():
    return R.success(FeishuConfigManager().get_public_config())


@router.post("/feishu_config")
def update_feishu_config(data: FeishuConfigRequest):
    cfg = FeishuConfigManager().update_config(
        enabled=data.enabled,
        auto_push=data.auto_push,
        app_id=data.app_id,
        app_secret=data.app_secret,
        folder_token=data.folder_token,
        base_url=data.base_url,
        push_backend=data.push_backend,
        cli_path=data.cli_path,
    )
    return R.success(cfg, msg="飞书配置已保存")


@router.post("/feishu_test")
def test_feishu_connection():
    try:
        result = feishu_pusher.test_connection()
        return R.success(result, msg=result.get("message", "连接成功"))
    except FeishuError as e:
        return R.error(msg=e.message, code=400)
    except Exception as e:
        logger.error(f"飞书连接测试异常: {e}", exc_info=True)
        return R.error(msg=f"连接失败：{e}", code=400)


# ─── 推送笔记 ─────────────────────────────────────────────────────────────────
@router.post("/feishu_push")
def push_note_to_feishu(data: FeishuPushRequest):
    try:
        info = push_task_to_feishu(data.task_id, data.version_id)
        return R.success(info, msg="已推送到飞书文档")
    except FeishuError as e:
        return R.error(msg=e.message, code=400)
    except Exception as e:
        logger.error(f"飞书推送失败 (task_id={data.task_id}): {e}", exc_info=True)
        return R.error(msg=f"推送失败：{e}", code=500)
