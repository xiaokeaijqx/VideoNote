import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.gpt.utils import strip_think_blocks


def test_paired_think_block_removed():
    text = "<think>让我想想这个视频讲了什么…</think>\n# 笔记标题\n\n正文内容"
    assert strip_think_blocks(text) == "# 笔记标题\n\n正文内容"


def test_multiple_blocks_and_thinking_variant():
    text = "<thinking>step 1</thinking>开头<THINK>step 2</THINK>结尾"
    assert strip_think_blocks(text) == "开头结尾"


def test_multiline_block_removed():
    text = "<think>\n第一行\n第二行\n</think>\n## 章节 *Content-[01:23]\n- 要点"
    assert strip_think_blocks(text) == "## 章节 *Content-[01:23]\n- 要点"


def test_orphan_close_tag_keeps_tail():
    # 部分网关吞掉起始 <think>，正文只剩孤立的 </think>
    text = "嗯，用户想要笔记，我先分析转录……\n</think>\n# 真正的笔记"
    assert strip_think_blocks(text) == "# 真正的笔记"


def test_unclosed_open_tag_drops_tail():
    # 输出被截断，只有起始标签
    text = "# 完整笔记\n\n正文\n<think>这段推理被截断了"
    assert strip_think_blocks(text) == "# 完整笔记\n\n正文"


def test_plain_text_untouched():
    text = "# 普通笔记\n\n没有任何标签，但提到了 think 这个词。"
    assert strip_think_blocks(text) == text


def test_none_and_empty():
    assert strip_think_blocks(None) == ""
    assert strip_think_blocks("") == ""
    assert strip_think_blocks("  \n ") == ""
