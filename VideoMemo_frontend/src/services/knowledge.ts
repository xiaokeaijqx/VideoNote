import request from '@/utils/request'
import type { ChatMessage } from '@/services/chat'

export interface KnowledgeSource {
  task_id: string
  title: string
  platform: string
  url: string
  uploader: string
  text: string
  source_type: 'meta' | 'markdown' | 'transcript' | string
  section_title?: string
  start_time?: number
  end_time?: number
}

export interface AskAcrossResponse {
  answer: string
  sources: KnowledgeSource[]
}

export interface AskAcrossScope {
  // null / undefined = 全库；空数组 = 没匹配任何笔记（前端筛选后为空）
  task_ids?: string[] | null
}

export const askAcross = async (data: {
  question: string
  history: ChatMessage[]
  scope: AskAcrossScope
  provider_id: string
  model_name: string
}): Promise<AskAcrossResponse> => {
  return await request.post('/chat/ask_across', data, { timeout: 120000 })
}

export interface IndexedTasksResponse {
  task_ids: string[]
}

export const listIndexedTasks = async (): Promise<IndexedTasksResponse> => {
  return await request.get('/chat/indexed_tasks')
}

export const reindexAll = async (taskIds?: string[]): Promise<{ count: number }> => {
  return await request.post('/chat/reindex_all', { task_ids: taskIds ?? null })
}
