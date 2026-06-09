"""issue #282 回归测试：UniversalGPT 拼装 content 时按是否有图片切换 string / array 形态。

DeepSeek deepseek-chat 等非多模态模型只接受 ``content`` 为字符串，旧实现无条件
emit ``[{"type":"text","text":...}]`` 导致 ``invalid_request_error``。
"""
import importlib.util
import pathlib
import sys
import types
import unittest


def _install_stubs():
    app_mod = types.ModuleType("app")
    gpt_pkg = types.ModuleType("app.gpt")
    models_pkg = types.ModuleType("app.models")

    base_mod = types.ModuleType("app.gpt.base")

    class _GPT:
        pass

    base_mod.GPT = _GPT

    prompt_builder_mod = types.ModuleType("app.gpt.prompt_builder")

    def _generate_base_prompt(**_kwargs):
        return "PROMPT_BODY"

    prompt_builder_mod.generate_base_prompt = _generate_base_prompt

    prompt_mod = types.ModuleType("app.gpt.prompt")
    prompt_mod.BASE_PROMPT = ""
    prompt_mod.AI_SUM = ""
    prompt_mod.SCREENSHOT = ""
    prompt_mod.LINK = ""
    prompt_mod.MERGE_PROMPT = "MERGE_HEAD"

    utils_mod = types.ModuleType("app.gpt.utils")

    def _fix_markdown(text):
        return text

    utils_mod.fix_markdown = _fix_markdown
    utils_mod.strip_think_blocks = lambda text: (text or "").strip()

    request_chunker_mod = types.ModuleType("app.gpt.request_chunker")

    class _RequestChunker:
        def __init__(self, *_args, **_kwargs):
            pass

        def group_texts_by_budget(self, texts, _builder, **_kwargs):
            return [texts]

    request_chunker_mod.RequestChunker = _RequestChunker

    gpt_model_mod = types.ModuleType("app.models.gpt_model")

    class _GPTSource:
        pass

    gpt_model_mod.GPTSource = _GPTSource

    transcriber_model_mod = types.ModuleType("app.models.transcriber_model")

    class _TranscriptSegment:
        def __init__(self, **kwargs):
            self.start = kwargs.get("start", 0)
            self.end = kwargs.get("end", 0)
            self.text = kwargs.get("text", "")

    transcriber_model_mod.TranscriptSegment = _TranscriptSegment

    sys.modules.setdefault("app", app_mod)
    sys.modules.setdefault("app.gpt", gpt_pkg)
    sys.modules.setdefault("app.models", models_pkg)
    sys.modules["app.gpt.base"] = base_mod
    sys.modules["app.gpt.prompt_builder"] = prompt_builder_mod
    sys.modules["app.gpt.prompt"] = prompt_mod
    sys.modules["app.gpt.utils"] = utils_mod
    sys.modules["app.gpt.request_chunker"] = request_chunker_mod
    sys.modules["app.models.gpt_model"] = gpt_model_mod
    sys.modules["app.models.transcriber_model"] = transcriber_model_mod


def _load_universal_gpt_class():
    _install_stubs()
    root = pathlib.Path(__file__).resolve().parents[1]
    module_path = root / "app" / "gpt" / "universal_gpt.py"
    spec = importlib.util.spec_from_file_location(
        "universal_gpt_content_format", module_path
    )
    if spec is None or spec.loader is None:
        raise ImportError("universal_gpt module spec not found")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.UniversalGPT


UniversalGPT = _load_universal_gpt_class()


class _DummyClient:
    """create_messages 不会真的调用 client，给个空壳即可。"""


def _make_gpt():
    return UniversalGPT(_DummyClient(), model="deepseek-chat")


class _ChoiceMessage:
    content = "ok"


class _Choice:
    message = _ChoiceMessage()


class _Response:
    choices = [_Choice()]
    usage = None


class _RejectImageUrlOnceCompletions:
    def __init__(self):
        self.calls = []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        messages = kwargs["messages"]
        serialized = str(messages)
        if len(self.calls) == 1 and "image_url" in serialized:
            raise ValueError(
                "Error code: 400 - {'error': {'message': "
                "'Failed to deserialize the JSON body into the target type: "
                "messages[0]: unknown variant `image_url`, expected `text`'"
            )
        return _Response()


class _RejectImageUrlOnceChat:
    def __init__(self):
        self.completions = _RejectImageUrlOnceCompletions()


class _RejectImageUrlOnceClient:
    def __init__(self):
        self.chat = _RejectImageUrlOnceChat()


class TestCreateMessagesContentFormat(unittest.TestCase):
    """覆盖 create_messages 在不同 video_img_urls 输入下的输出形态。"""

    def test_no_images_emits_string_content(self):
        """无图片时 content 为 str（DeepSeek / 非多模态模型可解析）。"""
        gpt = _make_gpt()

        messages = gpt.create_messages(segments=[])

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "user")
        self.assertIsInstance(messages[0]["content"], str)
        self.assertEqual(messages[0]["content"], "PROMPT_BODY")

    def test_empty_image_list_emits_string_content(self):
        """显式传入空列表也要走纯文本分支，避免图片字段误触发。"""
        gpt = _make_gpt()

        messages = gpt.create_messages(segments=[], video_img_urls=[])

        self.assertIsInstance(messages[0]["content"], str)

    def test_with_images_emits_multimodal_array(self):
        """有图片时保留多模态 array 形态，确保多模态模型功能不退化。"""
        gpt = _make_gpt()

        messages = gpt.create_messages(
            segments=[],
            video_img_urls=["https://example.com/a.jpg", "https://example.com/b.jpg"],
        )

        content = messages[0]["content"]
        self.assertIsInstance(content, list)
        self.assertEqual(len(content), 3)  # 1 text + 2 images
        self.assertEqual(content[0], {"type": "text", "text": "PROMPT_BODY"})
        self.assertEqual(content[1]["type"], "image_url")
        self.assertEqual(content[1]["image_url"]["url"], "https://example.com/a.jpg")
        # 不应携带 detail 字段：MiniMax 等兼容接口对 detail:"auto" 报 400 (2013)，
        # OpenAI 缺省值本来就是 auto
        self.assertNotIn("detail", content[1]["image_url"])
        self.assertEqual(content[2]["image_url"]["url"], "https://example.com/b.jpg")

    def test_no_image_url_field_when_no_images(self):
        """纯文本响应里不应该出现 image_url 关键字 —— 这是触发 DeepSeek 400 的根因。"""
        gpt = _make_gpt()

        messages = gpt.create_messages(segments=[])

        import json
        serialized = json.dumps(messages, ensure_ascii=False)
        self.assertNotIn("image_url", serialized)

    def test_image_url_unsupported_error_retries_with_text_only_content(self):
        """兼容只支持 text content part 的 OpenAI-compatible 网关。"""
        client = _RejectImageUrlOnceClient()
        gpt = UniversalGPT(client, model="text-only-compatible-model")
        messages = gpt.create_messages(
            segments=[],
            video_img_urls=["data:image/jpeg;base64,abc"],
        )

        response = gpt._chat_completion_create(messages)

        self.assertIsInstance(response, _Response)
        calls = client.chat.completions.calls
        self.assertEqual(len(calls), 2)
        first_content = calls[0]["messages"][0]["content"]
        second_content = calls[1]["messages"][0]["content"]
        self.assertTrue(gpt.vision_fallback_used)
        self.assertIsInstance(first_content, list)
        self.assertIn("image_url", str(first_content))
        self.assertIsInstance(second_content, str)
        self.assertIn("PROMPT_BODY", second_content)
        self.assertIn("不要输出 Screenshot", second_content)
        self.assertNotIn("image_url", str(calls[1]["messages"]))


class TestBuildMergeMessagesContentFormat(unittest.TestCase):
    """合并阶段从不带图片，应该统一走 string content 路径。"""

    def test_merge_messages_use_string_content(self):
        """否则长视频 chunk 后的合并阶段还会复现 issue #282 错误。"""
        gpt = _make_gpt()

        messages = gpt._build_merge_messages(["partial-A", "partial-B"])

        self.assertEqual(len(messages), 1)
        self.assertEqual(messages[0]["role"], "user")
        self.assertIsInstance(messages[0]["content"], str)
        self.assertIn("MERGE_HEAD", messages[0]["content"])
        self.assertIn("partial-A", messages[0]["content"])
        self.assertIn("partial-B", messages[0]["content"])

    def test_merge_messages_no_image_url_field(self):
        gpt = _make_gpt()

        messages = gpt._build_merge_messages(["x"])

        import json
        serialized = json.dumps(messages, ensure_ascii=False)
        self.assertNotIn("image_url", serialized)


if __name__ == "__main__":
    unittest.main()
