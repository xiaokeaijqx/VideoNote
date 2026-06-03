import os
from typing import List

from app.decorators.timeit import timeit
from app.models.transcriber_model import TranscriptSegment, TranscriptResult
from app.transcriber.base import Transcriber
from app.utils.logger import get_logger
from events import transcription_finished

logger = get_logger(__name__)


class FunASRTranscriber(Transcriber):
    """FunASR（阿里达摩院）本地语音识别。

    中文识别效果通常优于 Whisper，自带 VAD + 标点恢复。依赖 funasr + torch（较重，
    约 2GB），属可选引擎：未安装时不可用，由 transcriber_provider 的 FUNASR_AVAILABLE
    兜底并提示安装。模型首次使用时通过 modelscope 自动下载。

    不同模型族初始化方式不同，按名称分支：
    - paraformer 系：model + vad_model(fsmn-vad) + punc_model(ct-punc)，输出 sentence_info（句级时间戳）
    - SenseVoice 系：model + vad_model（不带 punc，自带标点），generate 用 language/use_itn，
      文本经 rich_transcription_postprocess 清洗；无句级时间戳，退化为整段
    """

    def __init__(
        self,
        model: str = None,
        device: str = None,
    ):
        self.model_name = (model or os.getenv("FUNASR_MODEL", "paraformer-zh")).strip()
        self.device = device or os.getenv("FUNASR_DEVICE") or None

        name = self.model_name.lower()
        self.is_sensevoice = "sensevoice" in name

        from funasr import AutoModel  # 懒加载：import funasr 会连带加载 torch

        if self.is_sensevoice:
            # SenseVoice：用全名仓库 id；只配 VAD，不配 punc（其文本自带标点/反正则）
            repo = self.model_name if "/" in self.model_name else "iic/SenseVoiceSmall"
            logger.info(f"初始化 FunASR(SenseVoice)：model={repo}, device={self.device or 'auto'}")
            kwargs = dict(
                model=repo,
                vad_model="fsmn-vad",
                vad_kwargs={"max_single_segment_time": 30000},
                disable_update=True,
            )
        else:
            # paraformer 等：vad + punc，输出句级时间戳
            logger.info(
                f"初始化 FunASR：model={self.model_name}, vad=fsmn-vad, punc=ct-punc, "
                f"device={self.device or 'auto'}"
            )
            kwargs = dict(
                model=self.model_name,
                vad_model="fsmn-vad",
                punc_model="ct-punc",
                disable_update=True,
            )
        if self.device:
            kwargs["device"] = self.device

        self.model = AutoModel(**kwargs)
        logger.info("FunASR 模型加载完成")

    def _vocab_mismatch_hint(self, err: Exception) -> str:
        return (
            f"FunASR 模型「{self.model_name}」与当前 funasr 版本不兼容"
            f"（模型词表与分词器不匹配：{err}）。"
            "英文/多语视频建议改用 SenseVoiceSmall（设置 → 音频转写配置 → FunASR 模型），"
            "或切换到 Whisper 引擎。"
        )

    @timeit
    def transcript(self, file_path: str) -> TranscriptResult:
        try:
            logger.info(f"FunASR 开始转写：{file_path}")
            segments: List[TranscriptSegment] = []
            full_text = ""

            if self.is_sensevoice:
                from funasr.utils.postprocess_utils import rich_transcription_postprocess
                results = self.model.generate(
                    input=file_path,
                    cache={},
                    language="auto",
                    use_itn=True,
                    batch_size_s=60,
                    merge_vad=True,
                    merge_length_s=15,
                )
                # SenseVoice 文本含 <|emotion|><|event|> 等标记，用官方后处理清洗
                parts = []
                for item in results or []:
                    raw = item.get("text", "")
                    parts.append(rich_transcription_postprocess(raw) if raw else "")
                full_text = "".join(parts).strip()
                # SenseVoice 不产句级时间戳，退化为整段
                if full_text:
                    segments.append(TranscriptSegment(start=0.0, end=0.0, text=full_text))
                raw_obj = results
            else:
                # 句级时间戳只有离线 zh 系 paraformer 支持：
                # - paraformer-en：无时间戳预测器，强开会解码越界（IndexError: piece id out of range）
                # - paraformer-zh-streaming：流式模型同样无时间戳，强开会 KeyError: 'timestamp'
                name_l = self.model_name.lower()
                want_ts = "paraformer-zh" in name_l and "streaming" not in name_l
                gen_kwargs = dict(input=file_path, batch_size_s=300)
                if want_ts:
                    gen_kwargs["sentence_timestamp"] = True
                try:
                    results = self.model.generate(**gen_kwargs)
                except (IndexError, KeyError) as e:
                    if want_ts:
                        # 保险：个别 zh 变体可能不支持句级时间戳，降级为无时间戳重试一次
                        logger.warning(f"{self.model_name} 句级时间戳解码失败（{e}），降级为无时间戳重试")
                        gen_kwargs.pop("sentence_timestamp", None)
                        try:
                            results = self.model.generate(**gen_kwargs)
                        except (IndexError, KeyError) as e2:
                            raise RuntimeError(self._vocab_mismatch_hint(e2)) from e2
                    elif isinstance(e, IndexError):
                        # 已无时间戳仍越界：模型包词表与 funasr 解码不匹配（如 paraformer-en
                        # 的 bpe.model 10000 词 vs tokens.json 10020 词），属上游兼容问题
                        raise RuntimeError(self._vocab_mismatch_hint(e)) from e
                    else:
                        raise
                item = results[0] if isinstance(results, list) and results else (results or {})
                full_text = (item.get("text") or "").strip()
                for sent in item.get("sentence_info") or []:
                    text = (sent.get("text") or "").strip()
                    if not text:
                        continue
                    # FunASR 时间戳单位毫秒
                    segments.append(TranscriptSegment(
                        start=float(sent.get("start", 0)) / 1000.0,
                        end=float(sent.get("end", 0)) / 1000.0,
                        text=text,
                    ))
                if not segments and full_text:
                    segments.append(TranscriptSegment(start=0.0, end=0.0, text=full_text))
                raw_obj = item

            if not full_text and segments:
                full_text = " ".join(s.text for s in segments)

            # 语言标记按模型名推断（影响下游 prompt 等）；SenseVoice 多语统一标 zh 兜底
            lang = "en" if "-en" in self.model_name.lower() else "zh"

            return TranscriptResult(
                language=lang,
                full_text=full_text,
                segments=segments,
                raw=raw_obj,
            )
        except Exception as e:
            logger.error(f"FunASR 转写失败：{e}")
            raise

    def on_finish(self, video_path: str, result: TranscriptResult) -> None:
        logger.info(f"FunASR 转写完成：{video_path}")
        transcription_finished.send({"file_path": video_path})
