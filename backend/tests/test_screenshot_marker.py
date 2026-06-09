import importlib.util
import pathlib


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "app" / "utils" / "screenshot_marker.py"
spec = importlib.util.spec_from_file_location("screenshot_marker", MODULE_PATH)
if spec is None or spec.loader is None:
    raise ImportError("screenshot_marker module spec not found")
screenshot_marker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screenshot_marker)
extract_screenshot_timestamps = screenshot_marker.extract_screenshot_timestamps
remove_screenshot_markers = screenshot_marker.remove_screenshot_markers
ensure_screenshot_markers = screenshot_marker.ensure_screenshot_markers


def test_remove_screenshot_markers_strips_supported_marker_formats():
    markdown = "A *Screenshot-[01:23]\nB Screenshot-02:34\nC"

    cleaned = remove_screenshot_markers(markdown)

    assert "Screenshot" not in cleaned
    assert "A " in cleaned
    assert "B " in cleaned


def test_extract_screenshot_timestamps_keeps_existing_formats():
    markdown = "A *Screenshot-[01:23]\nB Screenshot-02:34"

    assert extract_screenshot_timestamps(markdown) == [
        ("*Screenshot-[01:23]", 83),
        ("Screenshot-02:34", 154),
    ]


def test_ensure_screenshot_markers_preserves_existing_markers():
    markdown = "## A\n\n*Screenshot-[01:23]"

    assert ensure_screenshot_markers(markdown, duration=120) == markdown


def test_ensure_screenshot_markers_adds_keyframes_when_model_omits_markers():
    markdown = "## A\n\n正文"

    result = ensure_screenshot_markers(markdown, duration=100)

    assert result.startswith(markdown)
    assert "## 关键画面" in result
    assert "*Screenshot-[00:25]" in result
    assert "*Screenshot-[00:50]" in result
    assert "*Screenshot-[01:15]" in result
