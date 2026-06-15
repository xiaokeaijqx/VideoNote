import request from '@/utils/request'

/** 本地下载器（家用 worker）配置与在线状态 */
export interface WorkerConfig {
  /** 是否启用「外部下载」（命中平台改由家用 worker 拉取） */
  enabled: boolean
  /** 走外部下载的平台列表，如 ["youtube"] */
  platforms: string[]
  /** worker 是否在线（最近 90s 内轮询过服务器） */
  worker_online: boolean
}

export const getWorkerConfig = async (): Promise<WorkerConfig> => {
  // 轮询状态用，失败不弹 toast
  return await request.get('/worker/config', { suppressToast: true })
}

export const updateWorkerConfig = async (
  enabled: boolean,
  platforms: string[]
): Promise<WorkerConfig> => {
  return await request.post('/worker/config', { enabled, platforms })
}
