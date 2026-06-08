# Article Crawling And Subscriptions Design

## Goal

Add article crawling, summarization, keyword discovery, keyword subscriptions, and publisher subscriptions for Xiaohongshu and WeChat official account articles.

The final feature should let users:

- Paste a Xiaohongshu note or WeChat official account article URL and generate a structured note.
- Search articles by keyword for supported platforms.
- Subscribe to a keyword and refresh matching article results.
- Subscribe to a publisher and refresh newly discovered articles from that publisher.
- Select discovered articles and summarize them through the same model, note display, export, and knowledge-base flows used by existing notes.

## Current Context

VideoMemo currently centers on video and audio notes:

- `backend/app/routers/note.py` exposes `POST /api/generate_note`.
- `backend/app/services/note.py` orchestrates download, subtitle/transcription, GPT summarization, status files, note persistence, and vector indexing.
- `backend/app/downloaders/xiaohongshu_downloader.py` uses yt-dlp for Xiaohongshu video/audio content and explicitly treats image/text notes as unsupported.
- `backend/app/validators/video_url_validator.py` recognizes Xiaohongshu only as a video-supported platform.
- SQLite currently has a thin `video_tasks` table for mapping `platform + video_id` to `task_id`.
- The redesigned frontend note flow lives in `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`.
- Existing note JSON files under `note_results/{task_id}.json` are the practical compatibility layer for display, export, and RAG indexing.

There is no current article content model, article crawler, subscription table, subscription refresh API, or frontend subscription management view.

## Recommended Approach

Build a separate article domain instead of forcing articles into the video pipeline.

The article domain should reuse shared pieces where they already fit:

- GPT provider/model resolution from `ProviderService`, `GPTFactory`, and `ModelConfig`.
- Task status files from the existing `TaskStatus` vocabulary where possible.
- Note JSON persistence shape, so article summaries can appear in existing viewers.
- `VectorStoreManager().index_task(task_id)` after successful generation.
- Existing export and manual edit endpoints once the resulting note JSON is compatible.

It should not reuse video-only concepts such as audio downloads, transcripts, screenshots, duration, frame grids, or video subtitle caches.

## Architecture

Backend modules:

- `backend/app/article_fetchers/base.py`
  Defines the crawler interface and normalized article data classes.
- `backend/app/article_fetchers/xiaohongshu.py`
  Fetches Xiaohongshu image/text notes and extracts title, author, body text, images, publish time when available, and source identifiers.
- `backend/app/article_fetchers/wechat.py`
  Fetches `mp.weixin.qq.com/s/...` article pages and extracts title, account name, body text, images, publish time when available, and source identifiers.
- `backend/app/services/article.py`
  Owns link generation, article search, subscription refresh, duplicate handling, summarization, note-result persistence, and vector indexing.
- `backend/app/routers/article.py`
  Exposes article generation, search, subscription, and discovered item APIs.
- `backend/app/db/models/articles.py`
  Adds article item and subscription tables.
- `backend/app/db/article_dao.py`
  Provides database access functions for article items and subscriptions.

Frontend modules:

- `VideoMemo_frontend/src/services/article.ts`
  Typed API client for generation, search, subscriptions, refresh, and item listing.
- `VideoMemo_frontend/src/pages/Articles/index.tsx`
  Article workspace with link summarization and subscription management.
- `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`
  Adds a compact entry point that routes users into the article workspace.
- `VideoMemo_frontend/src/layouts/MainLayout.tsx`
  Navigation entry for articles/subscriptions, if the app keeps a separate page.

## Data Model

`article_items` stores crawled or discovered source articles.

Fields:

- `id`: integer primary key.
- `platform`: `xiaohongshu` or `wechat_mp`.
- `article_id`: stable platform identifier when available.
- `url`: canonical source URL.
- `url_hash`: hash used for dedupe when platform IDs are missing.
- `title`: article title.
- `author_name`: note author or official account name.
- `author_id`: stable publisher identifier when available.
- `summary_status`: `pending`, `summarizing`, `summarized`, `failed`.
- `task_id`: generated note task id after summarization.
- `cover_url`: first image or platform cover when available.
- `published_at`: source publish time when available.
- `discovered_at`: local discovery time.
- `raw_metadata`: JSON string with platform-specific fields.

Unique constraint:

- Prefer `platform + article_id` when `article_id` exists.
- Use `platform + url_hash` as fallback dedupe.

`article_subscriptions` stores saved search and publisher watches.

Fields:

- `id`: integer primary key.
- `platform`: `xiaohongshu`, `wechat_mp`, or `all`.
- `type`: `keyword` or `publisher`.
- `query`: keyword text, account name, author handle, author id, or publisher URL.
- `label`: display label.
- `enabled`: boolean.
- `last_refresh_at`: last manual or scheduled refresh time.
- `last_error`: most recent platform-level error.
- `created_at`: creation time.
- `updated_at`: update time.

`article_subscription_items` links subscriptions to discovered articles.

Fields:

- `subscription_id`: subscription id.
- `article_item_id`: article item id.
- `matched_at`: discovery time.
- `match_reason`: keyword or publisher match explanation.

## API Contract

Generate a note from a direct article URL:

```http
POST /api/articles/generate
```

Request:

```json
{
  "url": "https://mp.weixin.qq.com/s/...",
  "platform": "wechat_mp",
  "provider_id": "openai",
  "model_name": "gpt-4.1-mini",
  "style": "minimal",
  "extras": "重点提炼可执行事项",
  "task_id": ""
}
```

Response:

```json
{
  "task_id": "uuid",
  "article_item_id": 12
}
```

Search by keyword:

```http
GET /api/articles/search?platform=xiaohongshu&keyword=AI工具&limit=20
```

Response data:

```json
{
  "platform": "xiaohongshu",
  "keyword": "AI工具",
  "items": [
    {
      "id": 12,
      "platform": "xiaohongshu",
      "title": "AI工具清单",
      "url": "https://www.xiaohongshu.com/explore/...",
      "author_name": "作者",
      "author_id": "author-id",
      "cover_url": "https://...",
      "published_at": ""
    }
  ],
  "status": "ok",
  "message": ""
}
```

Create a subscription:

```http
POST /api/article_subscriptions
```

Request:

```json
{
  "platform": "wechat_mp",
  "type": "publisher",
  "query": "公众号名称或主页链接",
  "label": "公众号名称"
}
```

List subscriptions:

```http
GET /api/article_subscriptions
```

Refresh a subscription:

```http
POST /api/article_subscriptions/{id}/refresh
```

List discovered items:

```http
GET /api/article_items?subscription_id=1&status=all
```

Summarize a discovered item:

```http
POST /api/article_items/{id}/summarize
```

## Fetching Strategy

### Xiaohongshu

Direct URL summarization is the first reliability target.

Supported URLs:

- `https://www.xiaohongshu.com/explore/{id}`
- `https://www.xiaohongshu.com/discovery/item/{id}`
- `https://xhslink.com/...` after redirect resolution.

Crawler behavior:

- Reuse `CookieConfigManager` for `xiaohongshu` cookies and browser-cookie selection.
- Extract embedded page state or JSON-LD when available.
- Fall back to readable HTML text extraction when embedded state is unavailable.
- Return clear errors when login, anti-bot, or missing-cookie conditions block extraction.
- Preserve images as remote URLs first. Later work can localize them if needed.

Keyword search and publisher refresh are less stable because Xiaohongshu search and user feeds commonly require authenticated browser state. These should be implemented as best-effort manual refresh operations with visible errors instead of silent background jobs.

### WeChat Official Accounts

Direct URL summarization is the first reliability target.

Supported URLs:

- `https://mp.weixin.qq.com/s/...`
- `https://mp.weixin.qq.com/s?__biz=...&mid=...&idx=...&sn=...`

Crawler behavior:

- Fetch the public article page.
- Extract title from `activity-name`, account name from `js_name`, publish time from page variables when available, and body from `js_content`.
- Normalize lazy-loaded image attributes such as `data-src`.
- Convert body HTML into readable Markdown or plain text before summarization.

Publisher subscription is inherently less stable than direct article fetch because WeChat does not provide a simple public official account feed API. The first version should accept a publisher URL, account identifier, or account name and use best-effort discovery. When discovery is unavailable, it should preserve the subscription and show an actionable refresh error.

## Summarization Flow

Article summarization should not call the video `NoteGenerator.generate()` path.

Use a new `ArticleNoteGenerator` or article service method:

1. Create or reuse `task_id`.
2. Write status `PARSING`.
3. Fetch and normalize article content.
4. Store or update `article_items`.
5. Write status `TRANSCRIBING` while preparing article text because the current task UI already understands this state. The UI copy can later be generalized to "preparing content".
6. Build an article-specific prompt containing title, author, publish time, source URL, and body content.
7. Generate Markdown through the configured GPT.
8. Prepend the original source link.
9. Save `note_results/{task_id}.json` with compatible fields:
   - `markdown`
   - `transcript` with `full_text` set to article body and segments as paragraphs.
   - `audio_meta` compatibility payload using `title`, `platform`, `video_id` as article id, `cover_url`, `duration=0`, and `raw_info`.
   - `total_tokens`
10. Mark the article item as summarized.
11. Write status `SUCCESS`.
12. Trigger vector indexing.

The compatibility payload is intentionally named imperfectly because existing viewers and indexers expect those fields. A later schema cleanup can rename the cross-content metadata once all consumers understand articles.

## Frontend UX

Add an article workspace rather than overloading every video control.

Main sections:

- Direct article summarization:
  - Platform selector.
  - Article URL input.
  - Model selector.
  - Style and extras controls.
  - Generate button.
- Keyword search:
  - Platform selector.
  - Keyword input.
  - Search button.
  - Results table/list.
  - Save as subscription action.
  - Summarize action per result.
- Subscriptions:
  - Existing subscriptions table.
  - Create keyword subscription.
  - Create publisher subscription.
  - Refresh action.
  - Last refresh status and errors.
- Discovered articles:
  - Source platform, title, publisher, discovered time, summary status.
  - Summarize, open source, and open generated note actions.

Keep UI controls dense and operational, matching the app's current workspace style rather than a marketing layout.

## Error Handling

Direct article fetch errors:

- Missing cookie or login-required errors should mention the relevant platform and point to downloader/cookie settings.
- Anti-bot or blocked requests should return a platform-level message without crashing the API process.
- Empty extraction should fail before GPT calls, with a message that the article body could not be extracted.

Subscription refresh errors:

- Store `last_error` on the subscription.
- Return partial results when some platform operations succeed.
- Do not disable subscriptions automatically after one failure.

Dedupe:

- Repeated refreshes must not create duplicate article items.
- Summarizing an already summarized item should return the existing `task_id` unless the user explicitly requests regeneration.

## Testing

Backend tests:

- `backend/tests/test_article_fetchers_wechat.py`
  - Parses title, author, body, publish metadata, and lazy images from fixture HTML.
- `backend/tests/test_article_fetchers_xiaohongshu.py`
  - Parses title, author, body, image URLs, and note id from fixture HTML or embedded JSON.
- `backend/tests/test_article_service.py`
  - Generates note JSON from normalized article content using a fake GPT.
  - Dedupes articles by platform id or URL hash.
  - Creates keyword and publisher subscriptions.
  - Refresh links subscription results to article items.
- `backend/tests/test_article_routes.py`
  - Validates `/api/articles/generate`.
  - Validates keyword search response structure.
  - Validates subscription create/list/refresh/item summarize endpoints.

Frontend verification:

- `pnpm build` for TypeScript and bundling.
- Browser verification at `http://localhost:3015/`:
  - Article page renders.
  - Direct article form submits and creates a pending task.
  - Keyword search displays results.
  - Keyword subscription can be created and refreshed.
  - Publisher subscription can be created and refreshed.
  - A discovered article can be summarized and opened in the existing note viewer.

## Delivery Phases

Phase 1: direct article summarization.

- Add normalized article fetcher interface.
- Implement WeChat direct URL parser.
- Implement Xiaohongshu direct URL parser.
- Add article generation API.
- Save generated summaries in existing note-result-compatible format.
- Trigger vector indexing.
- Add frontend article direct-summary form.
- Add tests for parsing and generation.

Phase 2: discovery and subscriptions.

- Add article subscription and item tables.
- Add keyword search API.
- Add keyword subscription create/list/refresh.
- Add publisher subscription create/list/refresh.
- Add discovered item listing and summarize-from-item API.
- Add frontend search, subscriptions, refresh, and discovered item views.
- Add dedupe and refresh tests.

Phase 3: scheduled refresh and polish.

- Optional recurring refresh automation inside the app.
- Better local image handling for article covers and body images.
- Richer publisher identity resolution.
- Cross-platform article filters in the knowledge base.

## Non-Goals

- Do not promise fully automatic background crawling in the first implementation.
- Do not bypass platform login, rate limits, or anti-bot protections.
- Do not scrape private or non-public content.
- Do not add unrelated platforms in this feature.
- Do not rewrite the existing video note pipeline.

## Implementation Decisions

- The frontend exposes articles as a standalone workspace page, with a compact entry point from the existing new-note page.
- Article generation reuses existing task status values for the first implementation. `PARSING`, `TRANSCRIBING`, `SAVING`, `SUCCESS`, and `FAILED` are enough to preserve current polling behavior.
- Generated article notes keep the existing `transcript` and `audio_meta` compatibility shape so current note display, export, edit, and vector indexing flows keep working.
