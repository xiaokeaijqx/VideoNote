import importlib.util
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "app" / "utils" / "note_helper.py"
spec = importlib.util.spec_from_file_location("note_helper", MODULE_PATH)
if spec is None or spec.loader is None:
    raise ImportError("note_helper module spec not found")
note_helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(note_helper)


class TestNoteHelper(unittest.TestCase):
    def test_prepend_source_link_adds_header_at_top(self):
        source_url = "https://www.bilibili.com/video/BV1xx411c7mD"
        markdown = "## 标题\n\n内容"

        result = note_helper.prepend_source_link(markdown, source_url)

        self.assertTrue(result.startswith(f"> 来源链接：{source_url}\n\n"))
        self.assertIn("## 标题", result)

    def test_prepend_source_link_does_not_duplicate_when_header_exists(self):
        source_url = "https://www.youtube.com/watch?v=abc123"
        markdown = f"> 来源链接：{source_url}\n\n## 标题\n\n内容"

        result = note_helper.prepend_source_link(markdown, source_url)

        self.assertEqual(result, markdown)

    def test_normalize_toc_strips_heading_markers_in_items(self):
        markdown = "## 目录\n\n- ## 1. 章节一\n- ## 2. 章节二\n\n## 1. 章节一\n正文"

        result = note_helper.normalize_toc(markdown)

        self.assertIn("- 1. 章节一", result)
        self.assertIn("- 2. 章节二", result)
        self.assertNotIn("- ## ", result)
        # 正文标题不受影响
        self.assertIn("\n## 1. 章节一\n", result)

    def test_normalize_toc_strips_heading_marker_inside_bold(self):
        markdown = "## 目录\n\n- **## 4. 应用矩阵**\n\n## 4. 应用矩阵\n正文"

        result = note_helper.normalize_toc(markdown)

        # 加粗保留，只剥标题标记
        self.assertIn("- **4. 应用矩阵**", result)

    def test_normalize_toc_keeps_sub_items_and_strips_their_markers(self):
        markdown = (
            "## 目录\n\n"
            "- 章节一\n"
            "  - 子项A\n"
            "  - ## 子项B\n"
            "- 章节二\n\n"
            "## 章节一\n正文"
        )

        result = note_helper.normalize_toc(markdown)

        # 嵌套子项允许、缩进保留；子项里的标题标记同样剥掉
        self.assertIn("  - 子项A", result)
        self.assertIn("  - 子项B", result)
        self.assertNotIn("- ## 子项B", result)
        self.assertIn("- 章节一", result)
        self.assertIn("- 章节二", result)

    def test_normalize_toc_noop_without_toc_section(self):
        markdown = "# 标题\n\n- 普通列表 ## 不该被动\n正文"

        self.assertEqual(note_helper.normalize_toc(markdown), markdown)
        self.assertIsNone(note_helper.normalize_toc(None))


if __name__ == "__main__":
    unittest.main()
