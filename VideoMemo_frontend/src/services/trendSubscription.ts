import request from '@/utils/request'

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface TrendSubscription {
  id: number
  name: string
  keywords: string[]
  platforms: string[]
  match_mode: 'any' | 'all'
  enabled: boolean
  push_enabled: boolean
  push_channel_ids: number[]
  last_matched_at: string | null
  unread_count: number
  created_at: string | null
  updated_at: string | null
}

export interface TrendSubscriptionMatch {
  id: number
  subscription_id: number
  platform: string
  item_id: string
  title: string
  url: string
  hot_score: string
  matched_keywords: string[]
  matched_at: string | null
  is_read: boolean
}

export interface NotificationChannel {
  id: number
  name: string
  type: 'webhook' | 'bark' | 'email'
  config: Record<string, unknown>
  enabled: boolean
  created_at: string | null
  updated_at: string | null
}

export interface MatchResult {
  subscription_id: number
  new_matches: number
  matches: TrendSubscriptionMatch[]
}

export interface MatchAllSummary {
  total_subscriptions: number
  total_new_matches: number
  by_subscription: MatchResult[]
}

// ─── Trend Subscriptions ────────────────────────────────────────────────────────

export const listTrendSubscriptions = (): Promise<TrendSubscription[]> =>
  request.get('/trend_subscriptions')

export const getTrendSubscription = (id: number): Promise<TrendSubscription> =>
  request.get(`/trend_subscriptions/${id}`)

export const createTrendSubscription = (data: {
  name: string
  keywords: string[]
  platforms?: string[]
  match_mode?: string
  push_enabled?: boolean
  push_channel_ids?: number[]
}): Promise<TrendSubscription> => request.post('/trend_subscriptions', data)

export const updateTrendSubscription = (
  id: number,
  data: Partial<{
    name: string
    keywords: string[]
    platforms: string[]
    match_mode: string
    enabled: boolean
    push_enabled: boolean
    push_channel_ids: number[]
  }>,
): Promise<TrendSubscription> => request.put(`/trend_subscriptions/${id}`, data)

export const deleteTrendSubscription = (id: number): Promise<void> =>
  request.delete(`/trend_subscriptions/${id}`)

export const triggerMatch = (id: number): Promise<MatchResult> =>
  request.post(`/trend_subscriptions/${id}/match`)

export const triggerMatchAll = (): Promise<MatchAllSummary> =>
  request.post('/trend_subscriptions/match_all')

export const listMatches = (
  subscriptionId: number,
  limit = 100,
  unreadOnly = false,
): Promise<TrendSubscriptionMatch[]> =>
  request.get(`/trend_subscriptions/${subscriptionId}/matches`, {
    params: { limit, unread_only: unreadOnly },
  })

export const listAllMatches = (limit = 100, unreadOnly = false): Promise<TrendSubscriptionMatch[]> =>
  request.get('/trend_matches', { params: { limit, unread_only: unreadOnly } })

export const markMatchesRead = (subscriptionId: number): Promise<{ marked_read: number }> =>
  request.post(`/trend_subscriptions/${subscriptionId}/matches/read-all`)

// ─── Notification Channels ──────────────────────────────────────────────────────

export const listNotificationChannels = (): Promise<NotificationChannel[]> =>
  request.get('/notification_channels')

export const getNotificationChannel = (id: number): Promise<NotificationChannel> =>
  request.get(`/notification_channels/${id}`)

export const createNotificationChannel = (data: {
  name: string
  type: string
  config: Record<string, unknown>
}): Promise<NotificationChannel> => request.post('/notification_channels', data)

export const updateNotificationChannel = (
  id: number,
  data: Partial<{
    name: string
    type: string
    config: Record<string, unknown>
    enabled: boolean
  }>,
): Promise<NotificationChannel> => request.put(`/notification_channels/${id}`, data)

export const deleteNotificationChannel = (id: number): Promise<void> =>
  request.delete(`/notification_channels/${id}`)

export const testNotificationChannel = (id: number): Promise<void> =>
  request.post(`/notification_channels/${id}/test`)
