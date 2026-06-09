import request from '@/utils/request'

export type ArticlePlatform = 'xiaohongshu' | 'wechat_mp' | 'generic_web'
export type ArticleSubscriptionType = 'keyword' | 'publisher'

export interface ArticleItem {
  id: number
  platform: ArticlePlatform
  title: string
  url: string
  author_name: string
  author_id: string
  cover_url: string
  published_at: string
  summary_status: 'pending' | 'summarizing' | 'summarized' | 'failed' | string
  task_id: string
  content_text?: string
}

export interface ArticleSubscription {
  id: number
  platform: ArticlePlatform
  type: ArticleSubscriptionType
  query: string
  label: string
  enabled: boolean
  last_error: string
}

export const generateArticle = async (data: {
  url: string
  platform: ArticlePlatform
  provider_id: string
  model_name: string
  style: string
  extras?: string
  task_id?: string
}): Promise<{ task_id: string; article_item_id: number }> => {
  return await request.post('/articles/generate', data)
}

export const importArticleContent = async (data: {
  url?: string
  platform: ArticlePlatform
  title?: string
  content_text: string
  author_name?: string
  provider_id: string
  model_name: string
  style: string
  extras?: string
  task_id?: string
}): Promise<{ task_id: string; article_item_id: number }> => {
  return await request.post('/articles/import_content', data)
}

export const searchArticles = async (params: {
  platform: ArticlePlatform
  keyword: string
  limit?: number
}): Promise<{
  platform: ArticlePlatform
  keyword: string
  status: string
  message: string
  items: ArticleItem[]
}> => {
  return await request.get('/articles/search', { params })
}

export const createArticleSubscription = async (data: {
  platform: ArticlePlatform
  type: ArticleSubscriptionType
  query: string
  label?: string
}): Promise<ArticleSubscription> => {
  return await request.post('/article_subscriptions', data)
}

export const listArticleSubscriptions = async (): Promise<ArticleSubscription[]> => {
  return await request.get('/article_subscriptions')
}

export const refreshArticleSubscription = async (
  id: number,
): Promise<{ subscription_id: number; count: number; items: ArticleItem[] }> => {
  return await request.post(`/article_subscriptions/${encodeURIComponent(id)}/refresh`)
}

export const listArticleItems = async (subscriptionId?: number): Promise<ArticleItem[]> => {
  return await request.get('/article_items', {
    params: subscriptionId ? { subscription_id: subscriptionId } : undefined,
  })
}

export const getArticleItem = async (id: number): Promise<ArticleItem> => {
  return await request.get(`/article_items/${encodeURIComponent(id)}`)
}

export const summarizeArticleItem = async (
  id: number,
  data: { provider_id: string; model_name: string; style: string; extras?: string },
): Promise<{ task_id: string; article_item_id: number }> => {
  return await request.post(`/article_items/${encodeURIComponent(id)}/summarize`, data)
}
