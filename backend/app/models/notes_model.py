from dataclasses import dataclass
from typing import Optional

from app.models.audio_model import AudioDownloadResult
from app.models.transcriber_model import TranscriptResult


@dataclass
class NoteResult:
    markdown: str                  # GPT 总结的 Markdown 内容
    transcript: TranscriptResult                # Whisper 转写结果
    audio_meta: AudioDownloadResult  # 音频下载的元信息（title、duration、封面等）
    total_tokens: int = 0          # 本次生成消耗的 LLM token 总量（0 表示供应商未返回）