from app.article_fetchers.xiaohongshu import (
    parse_xiaohongshu_article_html,
    parse_xiaohongshu_discovery_html,
)


XHS_HTML = """
<html>
  <head>
    <script>
      window.__INITIAL_STATE__ = {
        "note": {
          "noteDetailMap": {
            "abc123": {
              "note": {
                "noteId": "abc123",
                "title": "小红书图文标题",
                "desc": "第一段\\n第二段",
                "user": {"userId": "u1", "nickname": "作者A"},
                "imageList": [
                  {"urlDefault": "https://sns-img-qc.xhscdn.com/a.jpg"},
                  {"url": "https://sns-img-qc.xhscdn.com/b.jpg"}
                ],
                "time": 1780905600000
              }
            }
          }
        }
      };
    </script>
  </head>
</html>
"""


def test_parse_xiaohongshu_article_extracts_embedded_note():
    article = parse_xiaohongshu_article_html(
        XHS_HTML,
        "https://www.xiaohongshu.com/explore/abc123",
    )

    assert article.platform == "xiaohongshu"
    assert article.article_id == "abc123"
    assert article.title == "小红书图文标题"
    assert article.author_name == "作者A"
    assert article.author_id == "u1"
    assert "第一段" in article.content_text
    assert "第二段" in article.content_text
    assert article.cover_url == "https://sns-img-qc.xhscdn.com/a.jpg"
    assert article.image_urls == [
        "https://sns-img-qc.xhscdn.com/a.jpg",
        "https://sns-img-qc.xhscdn.com/b.jpg",
    ]


def test_parse_xiaohongshu_article_falls_back_to_meta_text():
    html = """
    <meta property="og:title" content="备用标题" />
    <meta name="description" content="备用正文" />
    """

    article = parse_xiaohongshu_article_html(
        html,
        "https://www.xiaohongshu.com/explore/fallback",
    )

    assert article.article_id == "fallback"
    assert article.title == "备用标题"
    assert article.content_text == "备用正文"


def test_parse_xiaohongshu_discovery_html_extracts_note_cards():
    html = """
    <script>
      window.__INITIAL_STATE__ = {
        "feeds": {
          "items": [
            {
              "id": "note-a",
              "title": "AI工具分享",
              "desc": "正文摘要",
              "user": {"userId": "u1", "nickname": "作者A"},
              "cover": {"url": "https://sns-img-qc.xhscdn.com/cover.jpg"}
            }
          ]
        }
      };
    </script>
    """

    items = parse_xiaohongshu_discovery_html(
        html,
        source_url="https://www.xiaohongshu.com/search_result?keyword=AI",
        limit=10,
    )

    assert len(items) == 1
    assert items[0].platform == "xiaohongshu"
    assert items[0].article_id == "note-a"
    assert items[0].title == "AI工具分享"
    assert items[0].url == "https://www.xiaohongshu.com/explore/note-a"
    assert items[0].author_name == "作者A"
    assert items[0].cover_url == "https://sns-img-qc.xhscdn.com/cover.jpg"
