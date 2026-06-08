from app.article_fetchers.wechat import parse_wechat_article_html
from app.article_fetchers.wechat import parse_wechat_search_html


WECHAT_HTML = """
<html>
  <head><title>ignored</title></head>
  <body>
    <h1 id="activity-name">  一篇公众号文章标题  </h1>
    <span id="js_name">  VideoMemo实验室  </span>
    <em id="publish_time">2026-06-08</em>
    <div id="js_content">
      <p>第一段正文</p>
      <p><strong>第二段正文</strong></p>
      <img data-src="https://mmbiz.qpic.cn/example.jpg" />
    </div>
    <script>
      var biz = "MzExample";
      var mid = "123456";
      var idx = "1";
      var sn = "abcdef";
    </script>
  </body>
</html>
"""


def test_parse_wechat_article_extracts_core_fields():
    article = parse_wechat_article_html(
        WECHAT_HTML,
        "https://mp.weixin.qq.com/s/example",
    )

    assert article.platform == "wechat_mp"
    assert article.article_id == "MzExample:123456:1:abcdef"
    assert article.title == "一篇公众号文章标题"
    assert article.author_name == "VideoMemo实验室"
    assert article.published_at == "2026-06-08"
    assert "第一段正文" in article.content_text
    assert "第二段正文" in article.content_text
    assert article.image_urls == ["https://mmbiz.qpic.cn/example.jpg"]


def test_parse_wechat_article_fails_when_body_is_empty():
    html = '<h1 id="activity-name">标题</h1><div id="js_content"></div>'

    try:
        parse_wechat_article_html(html, "https://mp.weixin.qq.com/s/empty")
    except ValueError as exc:
        assert "正文" in str(exc)
    else:
        raise AssertionError("expected parser to reject empty article body")


def test_parse_wechat_search_html_extracts_article_results():
    html = """
    <html>
      <body>
        <div class="news-box">
          <a target="_blank" href="/link?url=https%3A%2F%2Fmp.weixin.qq.com%2Fs%2Fabc">AI工具清单</a>
          <p class="txt-info">公众号作者</p>
          <p class="txt-info">正文摘要</p>
        </div>
      </body>
    </html>
    """

    items = parse_wechat_search_html(html, "AI工具", limit=5)

    assert len(items) == 1
    assert items[0].platform == "wechat_mp"
    assert items[0].title == "AI工具清单"
    assert items[0].url == "https://mp.weixin.qq.com/s/abc"
    assert items[0].author_name == "公众号作者"
    assert items[0].content_text == "正文摘要"
