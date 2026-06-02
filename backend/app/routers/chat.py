from typing import Optional

from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel

from app.services.chat_service import chat as chat_service, chat_across as chat_across_service
from app.services.vector_store import VectorStoreManager
from app.utils.logger import get_logger
from app.utils.response import ResponseWrapper as R

logger = get_logger(__name__)

router = APIRouter()

# 索引状态追踪: task_id -> "indexing" | "indexed" | "failed"
_index_status: dict[str, str] = {}


class IndexRequest(BaseModel):
    task_id: str


class ChatMessage(BaseModel):
    role: str
    content: str


class AskRequest(BaseModel):
    task_id: str
    question: str
    history: list[ChatMessage] = []
    provider_id: str
    model_name: str


def _do_index(task_id: str):
    """后台执行索引任务。"""
    try:
        _index_status[task_id] = "indexing"
        store = VectorStoreManager()
        store.index_task(task_id)
        _index_status[task_id] = "indexed"
        logger.info(f"索引完成: {task_id}")
    except Exception as e:
        _index_status[task_id] = "failed"
        logger.error(f"索引失败: {task_id}, {e}")


@router.post("/chat/index")
def index_task(data: IndexRequest, background_tasks: BackgroundTasks):
    """触发后台索引，立即返回。"""
    if _index_status.get(data.task_id) == "indexing":
        return R.success(msg="正在索引中")

    # 如果已经索引过，直接返回
    store = VectorStoreManager()
    if store.is_indexed(data.task_id):
        _index_status[data.task_id] = "indexed"
        return R.success(msg="已完成索引")

    _index_status[data.task_id] = "indexing"
    background_tasks.add_task(_do_index, data.task_id)
    return R.success(msg="开始索引")


@router.get("/chat/status")
def chat_status(task_id: str):
    """返回索引状态：idle / indexing / indexed / failed。"""
    try:
        # 优先检查内存状态
        status = _index_status.get(task_id)
        if status:
            return R.success(data={"status": status, "indexed": status == "indexed"})

        # 内存没有记录，检查持久化
        store = VectorStoreManager()
        indexed = store.is_indexed(task_id)
        if indexed:
            _index_status[task_id] = "indexed"
        return R.success(data={"status": "indexed" if indexed else "idle", "indexed": indexed})
    except Exception as e:
        logger.error(f"查询索引状态失败: {e}")
        return R.success(data={"status": "idle", "indexed": False})


@router.post("/chat/ask")
def ask_question(data: AskRequest):
    """基于笔记内容的 RAG 问答。"""
    try:
        history = [{"role": m.role, "content": m.content} for m in data.history]
        result = chat_service(
            task_id=data.task_id,
            question=data.question,
            history=history,
            provider_id=data.provider_id,
            model_name=data.model_name,
        )
        return R.success(data=result)
    except ValueError as e:
        return R.error(msg=str(e))
    except Exception as e:
        logger.error(f"Chat 问答失败: {e}", exc_info=True)
        return R.error(msg=f"问答失败: {str(e)}")


# ── 跨笔记知识库问答 ─────────────────────────────────────────


class AskAcrossScope(BaseModel):
    """
    跨笔记检索的过滤条件。
    - task_ids=None → 全库
    - task_ids=[] → 没匹配到任何笔记（合集筛选后为空时使用，由前端解析）
    """
    task_ids: Optional[list[str]] = None


class AskAcrossRequest(BaseModel):
    question: str
    history: list[ChatMessage] = []
    scope: AskAcrossScope = AskAcrossScope()
    provider_id: str
    model_name: str


@router.post("/chat/ask_across")
def ask_across(data: AskAcrossRequest):
    """跨多篇笔记的知识库问答。前端把合集/平台/时间过滤解析成 task_ids 列表传入。"""
    try:
        history = [{"role": m.role, "content": m.content} for m in data.history]
        result = chat_across_service(
            question=data.question,
            history=history,
            scope={"task_ids": data.scope.task_ids},
            provider_id=data.provider_id,
            model_name=data.model_name,
        )
        return R.success(data=result)
    except ValueError as e:
        return R.error(msg=str(e))
    except Exception as e:
        logger.error(f"跨笔记问答失败: {e}", exc_info=True)
        return R.error(msg=f"问答失败: {str(e)}")


@router.get("/chat/indexed_tasks")
def list_indexed_tasks():
    """返回所有已建立向量索引的 task_id，供前端「重建/统计」用。"""
    try:
        store = VectorStoreManager()
        return R.success(data={"task_ids": store.list_indexed_task_ids()})
    except Exception as e:
        logger.error(f"列出索引失败: {e}")
        return R.error(msg=str(e))


def _do_reindex_all(task_ids: list[str]):
    """后台批量重建索引。"""
    store = VectorStoreManager()
    for tid in task_ids:
        try:
            store.index_task(tid)
            _index_status[tid] = "indexed"
        except Exception as e:
            _index_status[tid] = "failed"
            logger.error(f"重建索引失败 task_id={tid}: {e}")
    logger.info(f"批量重建索引完成，共 {len(task_ids)} 个")


class ReindexAllRequest(BaseModel):
    task_ids: Optional[list[str]] = None  # None = 重建所有已索引的


@router.post("/chat/reindex_all")
def reindex_all(data: ReindexAllRequest, background_tasks: BackgroundTasks):
    """后台批量重建索引（兜底用，不阻塞返回）。task_ids=None 时重建所有已索引的笔记。"""
    store = VectorStoreManager()
    targets = data.task_ids if data.task_ids is not None else store.list_indexed_task_ids()
    if not targets:
        return R.success(msg="没有需要重建的索引", data={"count": 0})
    for tid in targets:
        _index_status[tid] = "indexing"
    background_tasks.add_task(_do_reindex_all, targets)
    return R.success(msg=f"已开始后台重建 {len(targets)} 个索引", data={"count": len(targets)})
