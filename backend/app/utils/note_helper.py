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
    """规范化「## 目录」区块为固定格式：`## 目录` + 一级纯文本列表。

    LLM 不一定每次都遵守 prompt 的格式要求，常见跑偏：
    - 把章节标题的 `##` 标记原样抄进列表项（`- ## 1. xxx`），渲染出来和正文标题一样大
    - 生成缩进的嵌套子项，目录层级混乱
    - 条目带加粗 / 原片跳转标记

    这里做确定性整形：标题标记/加粗剥掉、嵌套子项丢弃（目录只保留章节级）、
    跳转标记移除。没有目录区块时原样返回。
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
            m = re.match(r'^(\s*)[-*+]\s+(.*)$', line)
            if m:
                indent, item = m.group(1), m.group(2).strip()
                # 缩进子项丢弃：目录只保留章节级条目
                if len(indent) >= 2:
                    continue
                item = re.sub(r'\*Content-\[\d{1,3}:\d{2}\]', '', item)  # 原片跳转标记
                # 循环剥离标题标记 / 首尾加粗符——可能互相嵌套（如 **## xxx**）
                prev = None
                while prev != item:
                    prev = item
                    item = re.sub(r'^#{1,6}\s*', '', item).strip()
                    item = item.strip('*').strip()
                if item:
                    out.append(f'- {item}')
                continue
            # 目录区块内的空行保留，其他杂行（如说明文字）原样保留
            out.append(line)
            continue
        out.append(line)
    return '\n'.join(out)


def replace_content_markers(markdown: str, video_id: str, platform: str = 'bilibili') -> str:
    """
    替换 *Content-04:16*、Content-04:16 或 Content-[04:16] 为超链接，跳转到对应平台视频的时间位置
    """
    # 匹配三种形式：*Content-04:16*、Content-04:16、Content-[04:16]
    pattern = r"(?:\*?)Content-(?:\[(\d{2}):(\d{2})\]|(\d{2}):(\d{2}))"

    safe_video_id = video_id

    def replacer(match):
        mm = match.group(1) or match.group(3)
        ss = match.group(2) or match.group(4)
        total_seconds = int(mm) * 60 + int(ss)

        if platform == 'bilibili':
            video_id = video_id.replace("_p", "?p=")
            url = f"https://www.bilibili.com/video/{video_id}&t={total_seconds}"
            parsed_video_id = safe_video_id.replace("_p", "?p=")
            url = f"https://www.bilibili.com/video/{parsed_video_id}&t={total_seconds}"
        elif platform == 'youtube':
            url = f"https://www.youtube.com/watch?v={video_id}&t={total_seconds}s"
            url = f"https://www.youtube.com/watch?v={safe_video_id}&t={total_seconds}s"
        elif platform == 'douyin':
            url = f"https://www.douyin.com/video/{video_id}"
            url = f"https://www.douyin.com/video/{safe_video_id}"
            return f"[原片 @ {mm}:{ss}]({url})"
        else:
            return f"({mm}:{ss})"

        return f"[原片 @ {mm}:{ss}]({url})"

    return re.sub(pattern, replacer, markdown)

