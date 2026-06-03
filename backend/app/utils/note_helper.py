import re


def prepend_source_link(markdown: str | None, source_url: str) -> str | None:
    """
    在笔记开头添加来源链接；若首个非空行已包含来源链接，则更新该行并避免重复。
    """
    if markdown is None:
        return None

    source = (source_url or "").strip()
    if not source:
        return markdown

    header = f"> 来源链接：{source}"
    lines = markdown.splitlines()
    first_non_empty_idx = None
    for idx, line in enumerate(lines):
        if line.strip():
            first_non_empty_idx = idx
            break

    if first_non_empty_idx is not None:
        first_line = lines[first_non_empty_idx].strip()
        if first_line.startswith("> 来源链接：") or first_line.startswith("来源链接："):
            lines[first_non_empty_idx] = header
            return "\n".join(lines)

    if markdown.strip():
        return f"{header}\n\n{markdown}"
    return header


def normalize_toc(markdown: str | None) -> str | None:
    """规范化「## 目录」区块：剥掉目录条目里误带的 `#`/`##` 标题标记。

    LLM 有时把章节标题的 `##` 标记原样抄进目录列表（`- ## 1. xxx`），
    渲染出来和正文标题一样大。这里只做一件事：把目录区块内所有列表条目
    （含缩进子项）开头的标题标记剥掉——嵌套子项、加粗、链接等都允许，
    原样保留。没有目录区块时原样返回。
    """
    if not markdown:
        return markdown

    lines = markdown.split('\n')
    out = []
    in_toc = False
    for line in lines:
        stripped = line.strip()
        # 目录区块开始（容忍 #/##/### 任意级别写法，统一归一为 ##）
        if re.match(r'^#{1,6}\s*目录\s*$', stripped):
            in_toc = True
            out.append('## 目录')
            continue
        if in_toc:
            # 下一个标题出现，目录区块结束
            if re.match(r'^#{1,6}\s', stripped):
                in_toc = False
                out.append(line)
                continue
            m = re.match(r'^(\s*[-*+]\s+)(.*)$', line)
            if m:
                prefix, item = m.group(1), m.group(2)
                # 只剥条目开头的标题标记；兼容加粗包裹的写法（**## xxx** → **xxx**），
                # 缩进/加粗/其余内容全部原样保留
                item = re.sub(r'^(\*{0,2})\s*#{1,6}\s+', r'\1', item)
                out.append(prefix + item)
                continue
            # 目录区块内的空行 / 其他杂行原样保留
            out.append(line)
            continue
        out.append(line)
    return '\n'.join(out)


def build_timestamp_url(platform: str, video_id: str, total_seconds: int) -> str | None:
    """按平台拼接「跳转到第 total_seconds 秒」的视频链接。

    仅 B 站 / YouTube 支持可靠的时间戳跳转；抖音 / 快手 / 小红书等只能给出
    视频本身的链接（无时间参数）；无法识别的平台返回 None（调用方降级为纯文本）。
    """
    if platform == 'bilibili':
        # video_id 形如 BV1xxx 或 BV1xxx_p2（多 P）；_p 段转成查询参数
        if "_p" in video_id:
            bvid, _, page = video_id.partition("_p")
            return f"https://www.bilibili.com/video/{bvid}?p={page}&t={total_seconds}"
        return f"https://www.bilibili.com/video/{video_id}?t={total_seconds}"
    if platform == 'youtube':
        return f"https://www.youtube.com/watch?v={video_id}&t={total_seconds}s"
    if platform == 'douyin':
        return f"https://www.douyin.com/video/{video_id}"
    if platform == 'kuaishou':
        return f"https://www.kuaishou.com/short-video/{video_id}"
    if platform == 'xiaohongshu':
        return f"https://www.xiaohongshu.com/explore/{video_id}"
    return None


def replace_content_markers(markdown: str, video_id: str, platform: str = 'bilibili') -> str:
    """
    替换 *Content-04:16*、Content-04:16 或 Content-[04:16] 为超链接，跳转到对应平台视频的时间位置
    """
    # 匹配三种形式：*Content-04:16*、Content-04:16、Content-[04:16]
    pattern = r"(?:\*?)Content-(?:\[(\d{2}):(\d{2})\]|(\d{2}):(\d{2}))"

    def replacer(match):
        mm = match.group(1) or match.group(3)
        ss = match.group(2) or match.group(4)
        total_seconds = int(mm) * 60 + int(ss)

        url = build_timestamp_url(platform, video_id, total_seconds)
        if not url:
            # 平台无法拼出链接：降级为纯文本时间，不留下死链
            return f"({mm}:{ss})"
        return f"[原片 @ {mm}:{ss}]({url})"

    return re.sub(pattern, replacer, markdown)

