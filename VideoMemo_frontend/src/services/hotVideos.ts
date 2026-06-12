import request from '@/utils/request'

// ─── All supported platform IDs ─────────────────────────────────────────────────

export const ALL_PLATFORMS = [
  // Video
  'bilibili', 'bilibili-hot-search', 'youtube', 'douyin', 'kuaishou', 'xiaohongshu',
  // News / social
  'weibo', 'zhihu', 'baidu', 'toutiao', 'thepaper', 'ifeng',
  'tieba', 'hupu', 'tencent', 'tencent-hot',
  'cankaoxiaoxi', 'zaobao', 'sputniknewscn',
  'chongbuluo', 'chongbuluo-hot', 'chongbuluo-latest',
  'kaopu', 'hackernews', 'producthunt',
  'v2ex', 'v2ex-share', 'solidot',
  'sspai', 'coolapk', 'douban', 'nowcoder', 'pcbeta', 'pcbeta-windows11',
  // Finance
  'wallstreetcn', 'wallstreetcn-hot', 'wallstreetcn-news', 'wallstreetcn-quick',
  'cls', 'cls-hot', 'cls-telegraph', 'cls-depth',
  '36kr', '36kr-quick', '36kr-renqi',
  'jin10', 'gelonghui', 'xueqiu', 'xueqiu-hotstock',
  'mktnews', 'mktnews-flash', 'fastbull', 'fastbull-express', 'fastbull-news',
  // IT / dev
  'ithome', 'juejin', 'github', 'github-trending-today', 'freebuf', 'aihot',
] as const

export type HotVideoPlatform = 'all' | (typeof ALL_PLATFORMS)[number]
export type HotVideoItemPlatform = (typeof ALL_PLATFORMS)[number]
export type HotVideoStatus = 'ok' | 'error' | 'unavailable'

// ─── Platform categories ────────────────────────────────────────────────────────

export const VIDEO_PLATFORMS: HotVideoItemPlatform[] = [
  'bilibili', 'bilibili-hot-search', 'youtube', 'douyin', 'kuaishou', 'xiaohongshu',
]

export const NEWS_PLATFORMS: HotVideoItemPlatform[] = [
  'weibo', 'zhihu', 'baidu', 'toutiao', 'thepaper', 'ifeng',
  'tieba', 'hupu', 'tencent', 'tencent-hot',
  'cankaoxiaoxi', 'zaobao', 'sputniknewscn',
  'chongbuluo', 'chongbuluo-hot', 'chongbuluo-latest',
  'kaopu',
]

export const FINANCE_PLATFORMS: HotVideoItemPlatform[] = [
  'wallstreetcn', 'wallstreetcn-hot', 'wallstreetcn-news', 'wallstreetcn-quick',
  'cls', 'cls-hot', 'cls-telegraph', 'cls-depth',
  '36kr', '36kr-quick', '36kr-renqi',
  'jin10', 'gelonghui', 'xueqiu', 'xueqiu-hotstock',
  'mktnews', 'mktnews-flash', 'fastbull', 'fastbull-express', 'fastbull-news',
]

export const DEV_PLATFORMS: HotVideoItemPlatform[] = [
  'ithome', 'juejin', 'github', 'github-trending-today', 'freebuf',
  'hackernews', 'producthunt', 'v2ex', 'v2ex-share', 'solidot',
  'sspai', 'coolapk', 'aihot',
]

export const ARTICLE_PLATFORMS: HotVideoItemPlatform[] = [
  ...NEWS_PLATFORMS, ...FINANCE_PLATFORMS, ...DEV_PLATFORMS,
  'douban', 'nowcoder', 'pcbeta', 'pcbeta-windows11',
]

export function isArticlePlatform(platform: HotVideoItemPlatform): boolean {
  return ARTICLE_PLATFORMS.includes(platform)
}

export function isVideoPlatform(platform: HotVideoItemPlatform): boolean {
  return VIDEO_PLATFORMS.includes(platform)
}

// ─── API types ──────────────────────────────────────────────────────────────────

export interface HotVideoItem {
  id: string
  platform: HotVideoItemPlatform
  title: string
  url: string
  cover_url?: string
  author?: string
  rank?: number
  hot_score?: string
  source?: string
}

export interface HotVideoPlatformResult {
  platform: HotVideoItemPlatform
  status: HotVideoStatus
  message: string
  items: HotVideoItem[]
}

export interface HotVideosResponse {
  platform: HotVideoPlatform
  limit: number
  generated_at: string
  platforms: HotVideoPlatformResult[]
}

// ─── API ────────────────────────────────────────────────────────────────────────

export const listHotVideos = async (
  platform: HotVideoPlatform = 'all',
  limit = 12,
  force = false,
): Promise<HotVideosResponse> => {
  return await request.get('/hot_videos', {
    params: { platform, limit, force },
    suppressToast: true,
  })
}
