import re
from typing import Optional
import requests


# 匹配文本中的第一个 http(s) 链接（贪到首个空白/中文/引号前为止）
_URL_RE = re.compile(r"https?://[^\s一-鿿\"'）)】>，。、]+")


def clean_url(text: str) -> str:
    """从「分享文案」里提取干净的链接。

    小红书/抖音/B 站的分享内容常是「标题 + 一堆不可见字符 + 链接」整段，
    直接丢给 yt-dlp 会被当成非法 URL（generic extractor 报 is not a valid URL）。
    这里：去掉 BOM/零宽等不可见字符，再抓出第一个 http(s) 链接；
    没抓到链接就返回去空白后的原文（兼容本地路径等非 URL 输入）。
    """
    if not text:
        return text
    # 去掉 BOM/零宽空格/零宽连接符等不可见字符
    cleaned = re.sub(r"[﻿​‌‍⁠]", "", text)
    m = _URL_RE.search(cleaned)
    if m:
        return m.group(0).strip().rstrip(".,;")
    return cleaned.strip()


def extract_video_id(url: str, platform: str) -> Optional[str]:
    """
    从视频链接中提取视频 ID

    :param url: 视频链接
    :param platform: 平台名（bilibili / youtube / douyin）
    :return: 提取到的视频 ID 或 None
    """
    if platform == "bilibili":
        # 如果是短链接，则解析真实链接
        if "b23.tv" in url:
            resolved_url = resolve_bilibili_short_url(url)
            if resolved_url:
                url = resolved_url

        # 匹配 BV号（如 BV1vc411b7Wa）
        match = re.search(r"BV([0-9A-Za-z]+)", url)
        return f"BV{match.group(1)}" if match else None

    elif platform == "youtube":
        # 匹配 v=xxxxx 或 youtu.be/xxxxx，ID 长度通常为 11
        match = re.search(r"(?:v=|youtu\.be/)([0-9A-Za-z_-]{11})", url)
        return match.group(1) if match else None

    elif platform == "douyin":
        # 匹配 douyin.com/video/1234567890123456789
        match = re.search(r"/video/(\d+)", url)
        return match.group(1) if match else None

    elif platform == "xiaohongshu":
        # 匹配 explore/{id} 或 discovery/item/{id}，id 通常是 24 位 hex
        match = re.search(r"/(?:explore|discovery/item)/([0-9a-fA-F]+)", url)
        return match.group(1) if match else None

    return None


def resolve_bilibili_short_url(short_url: str) -> Optional[str]:
    """
    解析哔哩哔哩短链接以获取真实视频链接

    :param short_url: Bilibili短链接（如"https://b23.tv/xxxxxx"）
    :return: 真实的视频链接或None
    """
    try:
        response = requests.head(short_url, allow_redirects=True)
        return response.url
    except requests.RequestException as e:
        print(f"Error resolving short URL: {e}")
        return None
