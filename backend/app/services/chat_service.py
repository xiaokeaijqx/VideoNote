import json
import os
from typing import Optional

from app.gpt.gpt_factory import GPTFactory
from app.models.model_config import ModelConfig
from app.services.provider import ProviderService
from app.services.vector_store import VectorStoreManager, NOTE_OUTPUT_DIR
from app.services.chat_tools import TOOLS, execute_tool
from app.utils.logger import get_logger

logger = get_logger(__name__)


def _load_task_brief(task_id: str) -> dict:
    """读出某篇笔记的标题/平台/URL，用于源卡片展示。失败返回空 dict。"""
    path = os.path.join(NOTE_OUTPUT_DIR, f"{task_id}.json")
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        return {}
    am = data.get("audio_meta", {}) or {}
    raw = am.get("raw_info", {}) or {}
    return {
        "title": am.get("title") or raw.get("title") or "(无标题)",
        "platform": am.get("platform") or "",
        "url": raw.get("webpage_url") or "",
        "uploader": raw.get("uploader") or "",
    }

SYSTEM_PROMPT = """你是一个视频笔记问答助手。你拥有以下能力：

1. 系统已自动检索了一些相关内容作为初始参考（见下方）
2. 你可以调用工具主动查询更多信息：
   - lookup_transcript: 查询视频原始转录文本（支持按时间、关键词、位置筛选）
   - get_video_info: 获取视频元信息（标题、作者、简介、标签等）
   - get_note_content: 获取完整笔记内容

--- 初始检索内容 ---
{context}
---

回答要求：
- 如果初始检索内容不足以回答问题，请主动调用工具获取更多信息
- 回答关于视频具体原话、细节时，用 lookup_transcript 查询原文
- 回答关于作者、标题等基本信息时，用 get_video_info 查询
- 请用中文回答，保持简洁准确"""


def _build_context(chunks: list[dict]) -> str:
    """将检索到的片段拼接为上下文文本。"""
    parts = []
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        source_type = meta.get("source_type", "unknown")
        if source_type == "meta":
            label = "[视频信息]"
        elif source_type == "markdown":
            label = f"[笔记 - {meta.get('section_title', '')}]"
        else:
            start = meta.get("start_time", 0)
            end = meta.get("end_time", 0)
            label = f"[转录 - {start:.0f}s~{end:.0f}s]"
        parts.append(f"{label}\n{chunk['text']}")
    return "\n\n".join(parts)


def _build_sources(chunks: list[dict]) -> list[dict]:
    """从检索片段中提取来源信息。"""
    sources = []
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        source = {
            "text": chunk["text"][:200],
            "source_type": meta.get("source_type", "unknown"),
        }
        if meta.get("section_title"):
            source["section_title"] = meta["section_title"]
        if meta.get("start_time") is not None:
            source["start_time"] = meta["start_time"]
        if meta.get("end_time") is not None:
            source["end_time"] = meta["end_time"]
        sources.append(source)
    return sources


def chat(
    task_id: str,
    question: str,
    history: list[dict],
    provider_id: str,
    model_name: str,
) -> dict:
    """
    RAG + Tool Calling 问答。
    1. 向量检索初始上下文
    2. 调用 LLM（带 tools）
    3. 如果 LLM 调用了工具，执行工具并将结果返回给 LLM
    4. 循环直到 LLM 给出最终回答
    """
    vector_store = VectorStoreManager()

    # 1. 检索初始上下文
    chunks = vector_store.query(task_id, question, n_results=6)
    context = _build_context(chunks) if chunks else "（未检索到相关内容，请使用工具查询）"
    sources = _build_sources(chunks) if chunks else []

    # 2. 构建消息
    system_msg = SYSTEM_PROMPT.format(context=context)
    messages = [{"role": "system", "content": system_msg}]

    for msg in history[-20:]:
        messages.append({"role": msg["role"], "content": msg["content"]})

    messages.append({"role": "user", "content": question})

    # 3. 获取 LLM client
    provider = ProviderService.get_provider_by_id(provider_id)
    if not provider:
        raise ValueError(f"未找到模型供应商: {provider_id}")

    config = ModelConfig(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        model_name=model_name,
        provider=provider["type"],
        name=provider["name"],
    )
    gpt = GPTFactory.from_config(config)

    logger.info(f"Chat: task_id={task_id}, model={model_name}")

    # 4. Tool calling 循环（最多 3 轮）
    max_rounds = 3
    for round_i in range(max_rounds):
        response = gpt.client.chat.completions.create(
            model=gpt.model,
            messages=messages,
            tools=TOOLS,
            temperature=0.7,
        )

        msg = response.choices[0].message

        # 没有工具调用，直接返回
        if not msg.tool_calls:
            return {"answer": msg.content or "", "sources": sources}

        # 处理工具调用
        messages.append(msg)

        for tool_call in msg.tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            logger.info(f"Tool call [{round_i+1}/{max_rounds}]: {fn_name}({fn_args})")

            result = execute_tool(fn_name, fn_args, default_task_id=task_id)

            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    # 超过最大轮次，做最后一次不带 tools 的调用
    response = gpt.client.chat.completions.create(
        model=gpt.model,
        messages=messages,
        temperature=0.7,
    )

    return {"answer": response.choices[0].message.content or "", "sources": sources}


# ── 跨笔记知识库问答 ─────────────────────────────────────────

ACROSS_SYSTEM_PROMPT = """你是一个跨视频笔记的知识库问答助手，可以同时基于多篇笔记回答问题。

工作方式：
1. 系统已经从知识库里检索到了若干个最相关的片段（见下方「初始检索内容」），每段都标注了它来自哪篇笔记
2. 如果初始片段不足，你可以调用工具针对**指定 task_id**的笔记深挖：
   - lookup_transcript(task_id, ...): 查询该笔记的转录文本
   - get_video_info(task_id): 获取该笔记的视频元信息
   - get_note_content(task_id): 获取该笔记的完整 Markdown

--- 初始检索内容 ---
{context}
---

回答要求：
- 综合多篇笔记的信息作答，遇到不同观点要明确指出来自哪篇
- 在正文里引用具体内容时，用《笔记标题》的形式标明出处
- 如果检索结果只跟一两篇笔记相关，回答时不要硬凑其它笔记
- 用中文回答，保持简洁准确"""


def _build_across_context(chunks: list[dict], briefs: dict[str, dict]) -> str:
    """跨笔记 context：每段都标注来源笔记标题 + task_id。"""
    parts = []
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        tid = chunk.get("task_id", "")
        brief = briefs.get(tid, {})
        title = brief.get("title", "(无标题)")
        source_type = meta.get("source_type", "unknown")
        if source_type == "meta":
            label = f"[来源:《{title}》· 视频信息 · task_id={tid}]"
        elif source_type == "markdown":
            label = f"[来源:《{title}》· 笔记 - {meta.get('section_title', '')} · task_id={tid}]"
        else:
            start = meta.get("start_time", 0)
            end = meta.get("end_time", 0)
            label = f"[来源:《{title}》· 转录 {start:.0f}s~{end:.0f}s · task_id={tid}]"
        parts.append(f"{label}\n{chunk['text']}")
    return "\n\n".join(parts)


def _build_across_sources(chunks: list[dict], briefs: dict[str, dict]) -> list[dict]:
    """跨笔记 sources：每条带 task_id + 标题 + 平台 + URL，方便前端做引用卡片+跳转。"""
    sources = []
    for chunk in chunks:
        meta = chunk.get("metadata", {})
        tid = chunk.get("task_id", "")
        brief = briefs.get(tid, {})
        source = {
            "task_id": tid,
            "title": brief.get("title", "(无标题)"),
            "platform": brief.get("platform", ""),
            "url": brief.get("url", ""),
            "uploader": brief.get("uploader", ""),
            "text": chunk["text"][:200],
            "source_type": meta.get("source_type", "unknown"),
        }
        if meta.get("section_title"):
            source["section_title"] = meta["section_title"]
        if meta.get("start_time") is not None:
            source["start_time"] = meta["start_time"]
        if meta.get("end_time") is not None:
            source["end_time"] = meta["end_time"]
        sources.append(source)
    return sources


def chat_across(
    question: str,
    history: list[dict],
    scope: dict,
    provider_id: str,
    model_name: str,
) -> dict:
    """
    跨笔记知识库问答。
    scope: {"task_ids": [...] | None}
        task_ids=None 或缺省 → 全库
        task_ids=[] → 视为没匹配到任何笔记
        task_ids=[...] → 只在这些笔记里检索
    """
    vector_store = VectorStoreManager()

    task_ids = scope.get("task_ids") if scope else None
    # None = 全库；空数组 = 用户筛了但没选中任何笔记，直接告知
    if task_ids is not None and len(task_ids) == 0:
        return {
            "answer": "当前过滤条件下没有可检索的笔记。请放宽过滤条件后再试。",
            "sources": [],
        }

    # 1. 跨 collection 检索
    chunks = vector_store.query_across(
        query_text=question,
        task_ids=task_ids,
        n_results_per_task=3,
        max_total=12,
    )

    if not chunks:
        return {
            "answer": "知识库里还没有任何索引内容。请先生成几篇笔记后再来提问。"
                      if not vector_store.list_indexed_task_ids()
                      else "未检索到与问题相关的内容。可以试试换种问法，或放宽过滤条件。",
            "sources": [],
        }

    # 2. 命中的笔记 brief（标题/平台/URL）
    hit_task_ids = list({c["task_id"] for c in chunks if c.get("task_id")})
    briefs = {tid: _load_task_brief(tid) for tid in hit_task_ids}

    context = _build_across_context(chunks, briefs)
    sources = _build_across_sources(chunks, briefs)

    # 3. 构建消息
    system_msg = ACROSS_SYSTEM_PROMPT.format(context=context)
    messages = [{"role": "system", "content": system_msg}]
    for msg in history[-20:]:
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": question})

    # 4. 获取 LLM client
    provider = ProviderService.get_provider_by_id(provider_id)
    if not provider:
        raise ValueError(f"未找到模型供应商: {provider_id}")
    config = ModelConfig(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        model_name=model_name,
        provider=provider["type"],
        name=provider["name"],
    )
    gpt = GPTFactory.from_config(config)

    logger.info(f"ChatAcross: hit_tasks={len(hit_task_ids)}, chunks={len(chunks)}, model={model_name}")

    # 5. Tool calling 循环（最多 3 轮）—— 跨笔记场景不传 default_task_id，强制模型在 arguments 里指定
    max_rounds = 3
    for round_i in range(max_rounds):
        response = gpt.client.chat.completions.create(
            model=gpt.model,
            messages=messages,
            tools=TOOLS,
            temperature=0.7,
        )
        msg = response.choices[0].message

        if not msg.tool_calls:
            return {"answer": msg.content or "", "sources": sources}

        messages.append(msg)
        for tool_call in msg.tool_calls:
            fn_name = tool_call.function.name
            try:
                fn_args = json.loads(tool_call.function.arguments)
            except json.JSONDecodeError:
                fn_args = {}

            logger.info(f"AcrossTool [{round_i+1}/{max_rounds}]: {fn_name}({fn_args})")
            result = execute_tool(fn_name, fn_args)  # 跨笔记：必须由 args 提供 task_id
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": result,
            })

    # 超过最大轮次，最后一次不带 tools
    response = gpt.client.chat.completions.create(
        model=gpt.model,
        messages=messages,
        temperature=0.7,
    )
    return {"answer": response.choices[0].message.content or "", "sources": sources}
