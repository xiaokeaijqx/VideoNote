import codecs
import re


def fix_markdown(markdown: str) -> str:
    return codecs.decode(markdown, 'unicode_escape')


# 推理模型（DeepSeek R1、QwQ 等）会把思考过程放进 <think>...</think> 标签返回；
# 部分供应商/网关还会吞掉起始标签只留下 </think>，或在输出截断时只有起始标签。
# 笔记/问答正文落地前统一剥掉，避免思考过程混进用户可见内容。
_THINK_PAIRED_RE = re.compile(r'<think(?:ing)?>.*?</think(?:ing)?>', re.IGNORECASE | re.DOTALL)
_THINK_ORPHAN_CLOSE_RE = re.compile(r'</think(?:ing)?>', re.IGNORECASE)
_THINK_UNCLOSED_RE = re.compile(r'<think(?:ing)?>.*\Z', re.IGNORECASE | re.DOTALL)


def strip_think_blocks(text: str | None) -> str:
    """剥离模型输出中的思考过程标签，返回干净正文。

    覆盖三种形态：
    - 成对标签：<think>...</think>（含多段、跨行、<thinking> 变体，大小写不敏感）
    - 只剩孤立 </think>（起始标签被供应商吃掉）：取最后一个闭合标签之后的内容
    - 只有 <think> 没闭合（输出被截断）：丢弃标签起的全部内容
    """
    if not text:
        return ""
    cleaned = _THINK_PAIRED_RE.sub('', text)

    last_close = None
    for last_close in _THINK_ORPHAN_CLOSE_RE.finditer(cleaned):
        pass
    if last_close:
        cleaned = cleaned[last_close.end():]

    cleaned = _THINK_UNCLOSED_RE.sub('', cleaned)
    return cleaned.strip()
