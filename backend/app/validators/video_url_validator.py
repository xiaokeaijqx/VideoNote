from pydantic import AnyUrl, validator, BaseModel, field_validator
import re
from urllib.parse import urlparse

SUPPORTED_PLATFORMS = {
    "bilibili": r"(https?://)?(www\.)?bilibili\.com/video/[a-zA-Z0-9]+",
    "youtube": r"(https?://)?(www\.)?(youtube\.com/watch\?v=|youtu\.be/)[\w\-]+",
    "douyin": "douyin",
    "kuaishou": "kuaishou",
    "xiaohongshu": "xiaohongshu",   # 子串匹配，小红书 explore/discovery 都能命中
}


def is_supported_video_url(url: str) -> bool:
    parsed = urlparse(url)

    # 检查是否为Bilibili的短链接
    if parsed.netloc == "b23.tv":
        return True
    # 小红书短链
    if parsed.netloc.endswith("xhslink.com"):
        return True

    for name, pattern in SUPPORTED_PLATFORMS.items():
        if pattern in ["douyin", "kuaishou", "xiaohongshu"]:
            if pattern in url:
                return True
        else:
            if re.match(pattern, url):
                return True

    # 兜底：检查用户自定义的平台
    try:
        from app.services.custom_platform_manager import match_custom_platform
        if match_custom_platform(url):
            return True
    except Exception:
        pass

    return False


class VideoRequest(BaseModel):
    url: AnyUrl
    platform: str

    @field_validator("url")
    def validate_video_url(cls, v):
        if not is_supported_video_url(str(v)):
            raise ValueError("暂不支持该视频平台或链接格式无效")
        return v
