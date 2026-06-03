import json
import re

from fastapi import APIRouter
from pydantic import BaseModel

from app.gpt.gpt_factory import GPTFactory
from app.gpt.utils import strip_think_blocks
from app.models.model_config import ModelConfig
from app.services.provider import ProviderService
from app.utils.logger import get_logger
from app.utils.response import ResponseWrapper as R

logger = get_logger(__name__)

router = APIRouter()


class FlashcardRequest(BaseModel):
    content: str
    provider_id: str
    model_name: str
    count: int = 10


SYSTEM_PROMPT = """你是一个学习卡片生成助手。请根据用户提供的笔记内容，提炼关键知识点，生成问答式记忆闪卡。

要求：
- 每张卡片包含 front（问题/正面）和 back（答案/背面）
- 问题应聚焦核心概念、定义、关键结论，便于主动回忆
- 答案简洁准确，控制在 1~3 句话
- 最多生成 {count} 张，不要硬凑，宁缺毋滥
- 严格只输出 JSON 数组，不要任何额外说明或 markdown 代码块，格式：
[{{"front": "问题", "back": "答案"}}]"""


def _parse_cards(text: str) -> list[dict]:
    """从 LLM 输出中解析出卡片数组，容忍代码块包裹。"""
    cleaned = text.strip()
    # 去掉 ```json ... ``` 包裹
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", cleaned, flags=re.IGNORECASE)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # 退化：抓取第一个 JSON 数组
        match = re.search(r"\[.*\]", cleaned, flags=re.DOTALL)
        if not match:
            return []
        try:
            data = json.loads(match.group(0))
        except json.JSONDecodeError:
            return []

    cards = []
    for item in data if isinstance(data, list) else []:
        front = (item or {}).get("front")
        back = (item or {}).get("back")
        if front and back:
            cards.append({"front": str(front), "back": str(back)})
    return cards


@router.post("/flashcards/generate")
def generate_flashcards(data: FlashcardRequest):
    """根据笔记内容用 LLM 生成问答闪卡。"""
    content = data.content.strip()
    if not content:
        return R.error(msg="笔记内容为空，无法生成闪卡")

    provider = ProviderService.get_provider_by_id(data.provider_id)
    if not provider:
        return R.error(msg=f"未找到模型供应商: {data.provider_id}")

    config = ModelConfig(
        api_key=provider["api_key"],
        base_url=provider["base_url"],
        model_name=data.model_name,
        provider=provider["type"],
        name=provider["name"],
    )
    gpt = GPTFactory.from_config(config)

    # 控制输入长度，避免超长 token
    max_chars = 12000
    snippet = content[:max_chars]

    try:
        response = gpt.client.chat.completions.create(
            model=gpt.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT.format(count=data.count)},
                {"role": "user", "content": snippet},
            ],
            temperature=0.4,
        )
        raw = strip_think_blocks(response.choices[0].message.content)
        cards = _parse_cards(raw)
        if not cards:
            logger.warning(f"闪卡解析为空，原始输出: {raw[:200]}")
            return R.error(msg="未能生成有效闪卡，请重试")
        return R.success(data={"cards": cards})
    except Exception as e:
        logger.error(f"生成闪卡失败: {e}", exc_info=True)
        return R.error(msg=f"生成闪卡失败: {str(e)}")
