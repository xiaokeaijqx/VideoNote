import request from '@/utils/request'

/** 飞书推送配置（后端隐去 app_secret 明文，只回 app_secret_set 表示是否已配置） */
export type FeishuPushBackend = 'auto' | 'rest' | 'cli'

export interface FeishuConfig {
  enabled: boolean
  auto_push: boolean
  app_id: string
  folder_token: string
  wiki_token: string
  base_url: string
  app_secret_set: boolean
  configured: boolean
  push_backend: FeishuPushBackend
  cli_path: string
}

export interface FeishuConfigUpdate {
  app_id?: string
  app_secret?: string
  folder_token?: string
  wiki_token?: string
  base_url?: string
  auto_push?: boolean
  enabled?: boolean
  push_backend?: FeishuPushBackend
  cli_path?: string
}

export interface FeishuPushResult {
  url: string
  token: string
  type: string
  title: string
  pushed_at: string
}

export const getFeishuConfig = async (): Promise<FeishuConfig> => {
  return await request.get('/feishu_config')
}

export const updateFeishuConfig = async (data: FeishuConfigUpdate): Promise<FeishuConfig> => {
  return await request.post('/feishu_config', data)
}

export const testFeishuConnection = async (): Promise<{
  success: boolean
  message: string
  backend?: FeishuPushBackend
}> => {
  // 失败由调用方自行 toast，避免和拦截器重复弹窗
  return await request.post('/feishu_test', {}, { suppressToast: true })
}

export const pushNoteToFeishu = async (
  taskId: string,
  versionId?: string
): Promise<FeishuPushResult> => {
  return await request.post(
    '/feishu_push',
    { task_id: taskId, version_id: versionId },
    { suppressToast: true }
  )
}
