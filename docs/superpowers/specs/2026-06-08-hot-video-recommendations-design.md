# Hot Video Recommendations Design

## Goal

Add a hot video recommendation feature to VideoMemo so users can fetch trending videos from supported platforms, see them in the new note page, click a recommendation to fill the source link, and then generate a note through the existing extraction flow.

## Scope

This first version covers the user-facing loop:

- Fetch hot videos for multiple platforms.
- Show recommendations on the new note page.
- Let users choose one recommendation.
- Fill the existing `video_url` and `platform` form state.
- Let the existing `generate_note` flow extract the selected video.

The feature does not create a new task type, database table, browser extension UI, or automatic note generation. Clicking a recommendation prepares the form; the user still controls generation with the existing button.

## Current Context

The active home experience uses `VideoMemo_frontend/src/pages/HomePage/NewNoteRedesigned.tsx`. It already owns `platform`, `url`, model, style, quality, format, and generation state. It calls `generateNote()` from `VideoMemo_frontend/src/services/note.ts`, and the backend receives that through `backend/app/routers/note.py`.

Backend APIs are registered in `backend/app/__init__.py` under the `/api` prefix and use `ResponseWrapper` from `backend/app/utils/response.py`.

The platform list is shared on the frontend through `VideoMemo_frontend/src/components/design/PlatformAvatar.tsx` and URL detection lives in `VideoMemo_frontend/src/utils/platform.ts`.

## Architecture

Create a small backend hotspot subsystem separate from note generation:

- `backend/app/services/hot_videos.py` owns platform fetchers, normalization, partial-failure behavior, and a short in-memory cache.
- `backend/app/routers/hot_videos.py` exposes `GET /api/hot_videos`.
- `backend/app/__init__.py` registers the new router.
- `VideoMemo_frontend/src/services/hotVideos.ts` calls the API and exposes typed data.
- `VideoMemo_frontend/src/pages/HomePage/components/HotVideoRecommendations.tsx` renders the recommendation list.
- `NewNoteRedesigned.tsx` embeds the component below the source input and handles item selection by setting `platform`, `url`, and `touchedPf`.

This keeps volatile platform scraping away from the stable note-generation path.

## API Contract

Request:

```http
GET /api/hot_videos?platform=all&limit=12
```

Supported `platform` values:

- `all`
- `bilibili`
- `youtube`
- `douyin`
- `kuaishou`
- `xiaohongshu`

Response data:

```json
{
  "platform": "all",
  "limit": 12,
  "generated_at": "2026-06-08T09:30:00+08:00",
  "platforms": [
    {
      "platform": "bilibili",
      "status": "ok",
      "message": "",
      "items": [
        {
          "id": "BV1xxxx",
          "platform": "bilibili",
          "title": "Video title",
          "url": "https://www.bilibili.com/video/BV1xxxx",
          "cover_url": "https://...",
          "author": "Uploader",
          "rank": 1,
          "hot_score": "123.4万播放",
          "source": "bilibili_popular"
        }
      ]
    },
    {
      "platform": "douyin",
      "status": "error",
      "message": "热点接口暂时不可用，请稍后刷新",
      "items": []
    }
  ]
}
```

The outer API should still return `code: 0` when one or more platforms succeed. A platform-level failure is represented inside `platforms[].status`. The outer API returns an error only for invalid request parameters or a total internal failure before any platform is attempted.

## Platform Fetch Strategy

First version behavior:

- Bilibili uses its public popular endpoint and maps `bvid`, `title`, `pic`, `owner.name`, and `stat.view` into the unified item shape.
- YouTube fetches `https://www.youtube.com/feed/trending`, parses the embedded `ytInitialData`, and extracts `videoRenderer` entries into watch URLs. If the current runtime is redirected to home, blocked, or returns no video entries, the YouTube platform result becomes `error` with an actionable message.
- Douyin tries the public web hot/search list endpoint and maps any video-like entries that include a usable item id or URL. If the endpoint is blocked by TLS, captcha, login, or anti-bot behavior, the Douyin platform result becomes `error`.
- Kuaishou tries a lightweight public web source first. If blocked or if the returned payload cannot be mapped to stable video URLs, it returns `error`.
- Xiaohongshu is included in the platform selector and returns `unavailable` in the first version because there is no stable public video-hot source available without login.

All fetchers must:

- Use short timeouts.
- Return normalized items, not raw upstream payloads.
- Catch platform-specific network and parsing failures.
- Avoid raising into the whole API unless the platform registry itself is broken.

## Caching

Use an in-memory cache in `hot_videos.py` with a short TTL, initially 10 minutes. Cache keys include `platform` and `limit`.

The cache protects users from repeatedly hitting fragile external endpoints when reopening the new note page. It is intentionally process-local and does not persist to SQLite.

## Frontend UX

Place the recommendation UI inside the new note form, directly under the URL input in the "Video source" card. The source input remains primary.

The recommendation area contains:

- A compact header: `热点推荐`.
- Platform filter chips: `全部`, `B 站`, `YouTube`, `抖音`, `快手`, `小红书`.
- A refresh icon button.
- A loading state with stable height to avoid layout jump.
- A responsive list of recommendation rows.

Each item row shows:

- Cover image when available.
- Platform avatar.
- Rank.
- Title.
- Author or hot score when available.

Clicking an item performs:

- `setPlatform(item.platform)`.
- `setUrl(item.url)`.
- `setTouchedPf(true)`.
- It does not submit the form.

After selection, the existing `detected` badge and generation button behavior remain unchanged.

## Error Handling

The frontend displays platform-level failures inline. Examples:

- `B 站热点暂时获取失败`
- `抖音热点受风控限制，稍后刷新或手动粘贴链接`
- `小红书暂未提供稳定公开视频热点源`

Failures are non-blocking. If Bilibili succeeds and Douyin fails, the user still sees Bilibili recommendations.

If all platforms fail, show a quiet empty state and keep the URL input available.

## Testing

Backend tests:

- `backend/tests/test_hot_videos_service.py`
  - Bilibili popular JSON maps into `HotVideoItem`.
  - A failing platform returns a platform result with `status="error"`.
  - `fetch_hot_videos("all")` returns successful platforms and failed platforms together.
  - Cache returns the first result inside the TTL.
- `backend/tests/test_hot_videos_route.py`
  - `GET /api/hot_videos?platform=bilibili&limit=3` returns `code: 0` and the normalized structure.
  - Invalid platform returns a business error.

Frontend verification:

- `pnpm build` confirms TypeScript and bundling.
- Manual browser verification at `http://localhost:3015/` confirms:
  - Recommendation list renders.
  - Platform chips filter results.
  - Refresh triggers a new API request.
  - Clicking a recommendation fills the platform and URL fields.
  - Existing generation flow can be started from the selected recommendation.

## Non-Goals

- No scheduled background crawling.
- No persistent hot-video database.
- No automatic note generation on click.
- No ranking algorithm beyond upstream order.
- No new platform support outside the current downloader-supported platforms.
