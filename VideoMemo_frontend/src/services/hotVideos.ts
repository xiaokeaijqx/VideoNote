import request from '@/utils/request'

export type HotVideoPlatform =
  | 'all'
  | 'bilibili'
  | 'youtube'
  | 'douyin'
  | 'kuaishou'
  | 'xiaohongshu'

export type HotVideoItemPlatform = Exclude<HotVideoPlatform, 'all'>
export type HotVideoStatus = 'ok' | 'error' | 'unavailable'

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
